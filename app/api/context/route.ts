import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';
import { parseDocx, parsePlainText } from '@/lib/context/parse';
import { saveContextDocument, listContextDocuments } from '@/lib/context/store';

// Reads request state and live data, so it must never be statically
// evaluated at build time.
export const dynamic = 'force-dynamic';

// The context library: Litera's own strategy documents, used to ground the
// "why it matters for us" relevance note.

async function requireReviewerOrAdmin() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated', status: 401 as const };
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'reviewer') {
    return { error: 'forbidden', status: 403 as const };
  }
  return { user };
}

/** GET: list the current context library (any signed-in user). */
export async function GET() {
  const supabase = supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const documents = await listContextDocuments();
    return NextResponse.json({ documents });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list documents' },
      { status: 500 }
    );
  }
}

/**
 * POST: upload (or replace) a context document. Multipart form with `file` and
 * `doc_type`. Uploading a type that already exists replaces it in place, so the
 * library always holds the current version rather than accumulating stale copies.
 */
export async function POST(req: NextRequest) {
  const auth = await requireReviewerOrAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'expected multipart form data' }, { status: 400 });

  const file = form.get('file');
  const docType = String(form.get('doc_type') ?? '');
  const titleOverride = String(form.get('title') ?? '').trim();

  const ALLOWED = ['roadmap', 'gtm_strategy', 'positioning', 'growth_story', 'company_profile', 'other'];
  if (!ALLOWED.includes(docType)) {
    return NextResponse.json({ error: `doc_type must be one of: ${ALLOWED.join(', ')}` }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const name = file.name || 'document';
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const parsed = name.toLowerCase().endsWith('.docx')
      ? await parseDocx(buffer)
      : parsePlainText(buffer.toString('utf8'));

    if (!parsed.fullText.trim()) {
      return NextResponse.json({ error: 'no readable text found in the file' }, { status: 400 });
    }

    const { id, sectionCount } = await saveContextDocument({
      docType,
      title: titleOverride || name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
      fileName: name,
      parsed,
      uploadedBy: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      id,
      sections: sectionCount,
      words: parsed.wordCount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to process document' },
      { status: 500 }
    );
  }
}
