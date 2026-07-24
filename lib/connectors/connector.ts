// The connector abstraction from 04-CONNECTORS.md. Every connector — inbound
// or outbound, any vendor — implements this same interface, so adding one is
// a single adapter file and nothing else in the pipeline changes.

export type ConnectorType = 'teams' | 'gmail' | 'salesforce' | 'gong' | 'crayon';
export type ConnectorDirection = 'inbound' | 'outbound';

export interface OutboundPayload {
  // The audience-ready content being distributed, plus enough context for a
  // human reading it in the destination channel to know what it is.
  audience: string;
  output_type: string;
  content: string;
  competitor?: string | null;
  signal_excerpt?: string;
  urgency?: 'low' | 'medium' | 'high' | null;
  source_type?: string | null;
  approved_by_name?: string | null;
  published_date?: string | null; // human-readable date for the footer
}

export interface RawSignalCandidate {
  raw_text: string;
  source_type: string;
  source_ref?: string;
  // Underlying source citations parsed out of the signal (e.g. Crayon Spark
  // footnote links). Stored separately from raw_text for display; never fed to
  // the pipeline. Omitted for sources that have none (e.g. manual entry).
  source_links?: { ref: string; url: string }[];
}

export interface Connector {
  type: ConnectorType;
  direction: ConnectorDirection;

  testConnection(): Promise<{ ok: boolean; message?: string }>;

  // Outbound only
  push?(payload: OutboundPayload): Promise<void>;

  // Inbound only
  fetch?(): Promise<RawSignalCandidate[]>;
}
