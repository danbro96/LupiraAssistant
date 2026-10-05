// Independent offline streams, each with its own monotonic seq: the health ring and summaries uploads
// plus the inbox acks queue (resolve/answer gestures).
export type Stream = 'ring' | 'summaries' | 'acks';
