// ===========================================================================
// Maison - reading and writing bags.
//
// Bags used to live in the browser's localStorage, which meant they were
// stuck on one device and vanished if you cleared your browser. They now
// live in Supabase:
//
//   - the details go in the "bags" table, stamped with your user id
//   - the photo goes in the PRIVATE "bag-photos" bucket, in a folder named
//     after your user id
//
// Row Level Security means the database refuses to return anybody else's
// rows or files, even if this front-end code asked it to.
//
// This file also contains the one-time import that moves an existing
// localStorage collection into an account.
// ===========================================================================

import { supabase, PHOTO_BUCKET } from './supabaseClient';

/** The old localStorage keys, kept here so the import can clean them up. */
export const LEGACY_BAGS_KEY = 'bagCollection';
export const LEGACY_API_KEY_KEY = 'anthropicApiKey';

/** How long a photo link stays valid for, in seconds. */
const SIGNED_URL_SECONDS = 60 * 60;

function client() {
  if (!supabase) {
    throw new Error('Maison is not connected to Supabase yet.');
  }
  return supabase;
}

async function currentUserId() {
  const { data } = await client().auth.getUser();
  const user = data ? data.user : null;
  if (!user) throw new Error('Please sign in again.');
  return user.id;
}

function extensionFor(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + String(Math.random()).slice(2);
}

/** Turns a "data:image/png;base64,..." string into something uploadable. */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string') return null;

  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl.trim());
  if (!match) return null;

  const mimeType = match[1].toLowerCase();

  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { blob: new Blob([bytes], { type: mimeType }), mimeType };
  } catch (error) {
    return null;
  }
}

/** Reads a File chosen in the upload box as a data URL. */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Turning database rows into the shape the screen already expects
// ---------------------------------------------------------------------------

function rowToBag(row, imageUrl) {
  return {
    id: row.id,
    image: imageUrl || '',
    photoPath: row.photo_path || '',
    name: row.name || '',
    brand: row.brand || '',
    model: row.model || '',
    condition: row.condition || 'good',
    purchasePrice: row.purchase_price === null ? '' : String(row.purchase_price),
    purchaseDate: row.purchase_date || '',
    estimatedValue:
      row.estimated_value === null ? '' : String(row.estimated_value),
    valuationReasoning: row.valuation_reasoning || '',
    marketTrend: row.market_trend || '',
    confidence: row.confidence || '',
    estimating: false,
  };
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldsToRow(fields) {
  const row = {};
  if ('name' in fields) row.name = fields.name || null;
  if ('brand' in fields) row.brand = fields.brand || null;
  if ('model' in fields) row.model = fields.model || null;
  if ('condition' in fields) row.condition = fields.condition || 'good';
  if ('purchasePrice' in fields) {
    row.purchase_price = numberOrNull(fields.purchasePrice);
  }
  if ('purchaseDate' in fields) row.purchase_date = fields.purchaseDate || null;
  if ('estimatedValue' in fields) {
    row.estimated_value = numberOrNull(fields.estimatedValue);
  }
  if ('valuationReasoning' in fields) {
    row.valuation_reasoning = fields.valuationReasoning || null;
  }
  if ('marketTrend' in fields) row.market_trend = fields.marketTrend || null;
  if ('confidence' in fields) row.confidence = fields.confidence || null;
  return row;
}

async function signedUrlsFor(paths) {
  const wanted = paths.filter(Boolean);
  if (wanted.length === 0) return {};

  const { data } = await client()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(wanted, SIGNED_URL_SECONDS);

  const byPath = {};
  (data || []).forEach((entry) => {
    if (entry && entry.path && entry.signedUrl) {
      byPath[entry.path] = entry.signedUrl;
    }
  });
  return byPath;
}

// ---------------------------------------------------------------------------
// The operations the screen uses
// ---------------------------------------------------------------------------

export async function listBags() {
  const { data, error } = await client()
    .from('bags')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data || [];
  const urls = await signedUrlsFor(rows.map((row) => row.photo_path));
  return rows.map((row) => rowToBag(row, urls[row.photo_path]));
}

export async function addBagFromFile(file) {
  const userId = await currentUserId();
  const id = newId();
  const path = userId + '/' + id + '.' + extensionFor(file.type);

  const upload = await client()
    .storage.from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upload.error) throw new Error(upload.error.message);

  const insert = await client()
    .from('bags')
    .insert({ id, user_id: userId, name: file.name, photo_path: path })
    .select()
    .single();

  if (insert.error) {
    // Do not leave an orphaned photo behind.
    await client().storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(insert.error.message);
  }

  const urls = await signedUrlsFor([path]);
  return rowToBag(insert.data, urls[path]);
}

export async function updateBagFields(id, fields) {
  const { error } = await client()
    .from('bags')
    .update(fieldsToRow(fields))
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function deleteBag(id, photoPath) {
  if (photoPath) {
    await client().storage.from(PHOTO_BUCKET).remove([photoPath]);
  }

  const { error } = await client().from('bags').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// One-time import of a collection that is still in localStorage
// ---------------------------------------------------------------------------

/** Returns the old collection, or an empty array if there isn't one. */
export function readLegacyBags() {
  try {
    const raw = window.localStorage.getItem(LEGACY_BAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

/** Removes the old collection AND the old saved Anthropic key. */
export function clearLegacyData() {
  try {
    window.localStorage.removeItem(LEGACY_BAGS_KEY);
    window.localStorage.removeItem(LEGACY_API_KEY_KEY);
  } catch (error) {
    // Nothing useful to do if storage is unavailable.
  }
}

/**
 * Copies every bag found in localStorage into the signed-in account, then
 * clears the old data (including the saved API key) if everything landed.
 */
export async function importLegacyBags(onProgress) {
  const legacy = readLegacyBags();
  if (legacy.length === 0) return { imported: 0, failed: 0 };

  const userId = await currentUserId();
  let imported = 0;
  let failed = 0;

  for (let index = 0; index < legacy.length; index += 1) {
    const old = legacy[index] || {};

    if (onProgress) onProgress(index + 1, legacy.length);

    try {
      const id = newId();
      let photoPath = null;

      const converted = dataUrlToBlob(old.image);
      if (converted) {
        photoPath = userId + '/' + id + '.' + extensionFor(converted.mimeType);
        const upload = await client()
          .storage.from(PHOTO_BUCKET)
          .upload(photoPath, converted.blob, {
            contentType: converted.mimeType,
            upsert: false,
          });
        if (upload.error) throw new Error(upload.error.message);
      }

      const row = Object.assign(
        { id: id, user_id: userId, photo_path: photoPath },
        fieldsToRow({
          name: old.name,
          brand: old.brand,
          model: old.model,
          condition: old.condition,
          purchasePrice: old.purchasePrice,
          purchaseDate: old.purchaseDate,
          estimatedValue: old.estimatedValue,
          valuationReasoning: old.valuationReasoning,
          marketTrend: old.marketTrend,
          confidence: old.confidence,
        })
      );

      const insert = await client().from('bags').insert(row);
      if (insert.error) {
        if (photoPath) {
          await client().storage.from(PHOTO_BUCKET).remove([photoPath]);
        }
        throw new Error(insert.error.message);
      }

      imported += 1;
    } catch (error) {
      console.error('Could not import one bag:', error);
      failed += 1;
    }
  }

  // Only wipe the old copy once everything is safely in the account.
  if (failed === 0) clearLegacyData();

  return { imported, failed };
}
