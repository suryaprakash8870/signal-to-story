import { supabaseServiceRole } from '../supabase/server';
import type { ParsedDocument } from './parse';

// Stores context documents and their sections.
//
// Uploading a document of a type that already exists REPLACES it in place, so
// the library always reflects the current version rather than accumulating
// stale copies. Sections cascade-delete with their parent document.

export interface StoredDocument {
  id: string;
  doc_type: string;
  title: string;
  file_name: string | null;
  word_count: number | null;
  updated_at: string;
  section_count?: number;
}

/**
 * Saves a parsed document and its sections, replacing any existing document of
 * the same doc_type. Returns the stored document id.
 */
export async function saveContextDocument(params: {
  docType: string;
  title: string;
  fileName?: string;
  parsed: ParsedDocument;
  uploadedBy?: string | null;
}): Promise<{ id: string; sectionCount: number }> {
  const db = supabaseServiceRole();
  const { docType, title, fileName, parsed, uploadedBy } = params;

  // Replace-in-place: one live document per type keeps the library current.
  await db.from('context_documents').delete().eq('doc_type', docType);

  const { data: doc, error: docErr } = await db
    .from('context_documents')
    .insert({
      doc_type: docType,
      title,
      file_name: fileName ?? null,
      full_text: parsed.fullText,
      word_count: parsed.wordCount,
      uploaded_by: uploadedBy ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (docErr || !doc) throw new Error(`failed to save context document: ${docErr?.message}`);

  if (parsed.sections.length > 0) {
    const rows = parsed.sections.map((s) => ({
      document_id: doc.id,
      heading: s.heading,
      content: s.content,
      position: s.position,
      word_count: s.wordCount,
    }));
    const { error: secErr } = await db.from('context_sections').insert(rows);
    if (secErr) throw new Error(`failed to save context sections: ${secErr.message}`);
  }

  return { id: doc.id, sectionCount: parsed.sections.length };
}

/** Lists the current context library with section counts, for the UI. */
export async function listContextDocuments(): Promise<StoredDocument[]> {
  const db = supabaseServiceRole();
  const { data, error } = await db
    .from('context_documents')
    .select('id, doc_type, title, file_name, word_count, updated_at')
    .order('doc_type', { ascending: true });
  if (error) throw new Error(`failed to list context documents: ${error.message}`);

  const docs = (data ?? []) as StoredDocument[];
  for (const d of docs) {
    const { count } = await db
      .from('context_sections')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', d.id);
    d.section_count = count ?? 0;
  }
  return docs;
}

/** Removes a context document (its sections cascade). */
export async function deleteContextDocument(id: string): Promise<void> {
  const db = supabaseServiceRole();
  const { error } = await db.from('context_documents').delete().eq('id', id);
  if (error) throw new Error(`failed to delete context document: ${error.message}`);
}
