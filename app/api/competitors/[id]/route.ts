import { NextRequest, NextResponse } from 'next/server';
import { supabaseForRequest } from '@/lib/supabase/server';

// DELETE a competitor. RLS restricts this to reviewer/admin. A competitor
// still referenced by a signal_classification cannot be deleted (the FK has
// no cascade, by design — history is not destroyed); that returns a clear
// message rather than a raw constraint error.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest();
  const { error } = await supabase.from('competitors').delete().eq('id', params.id);
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'This competitor is referenced by existing signals and cannot be deleted.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
