/** Convert spoken punctuation commands to actual punctuation characters.
 * Handles 47+ patterns including sentence-enders, mid-sentence, line breaks, symbols.
 * Applied to Web Speech, Deepgram, and ElevenLabs transcripts. */
export function convertSpokenPunctuation(text: string): string {
  let t = text;

  // Step 1: Strip commas/periods between adjacent punctuation commands
  t = t.replace(/\b(period|full stop|question mark|exclamation (?:mark|point))[.,;,\s]+(?=new (?:line|paragraph)|next (?:line|paragraph)|line break|paragraph break)/gi, '$1 ');

  // Step 2a: Compound patterns — word form (sentence-ender + line break)
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '.\n\n');
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '.\n');
  t = t.replace(/\s*\b(?:question mark)\b\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '?\n\n');
  t = t.replace(/\s*\b(?:question mark)\b\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '?\n');

  // Step 2b: Already-punctuated form — iOS converts "period" to "." automatically
  t = t.replace(/([.!?])\s*\b(?:new paragraph|next paragraph|paragraph break)\b[.!?]?\s*/gi, '$1\n\n');
  t = t.replace(/([.!?])\s*\b(?:new line|newline|next line|line break)\b[.!?]?\s*/gi, '$1\n');

  // Step 3: Individual punctuation commands
  t = t.replace(/\s*(?<!\bmenstrual )\b(?:period|full stop)\b(?!\s+of)\s*/gi, '. ');
  t = t.replace(/\s*\b(?:question mark)\b\s*/gi, '? ');
  t = t.replace(/\s*\b(?:exclamation (?:mark|point))\b\s*/gi, '! ');
  t = t.replace(/\s*\b(?:ellipsis|dot dot dot)\b\s*/gi, '... ');
  t = t.replace(/\s*\bcomma\b\s*/gi, ', ');
  t = t.replace(/\s*\bcolon\b\s*/gi, ': ');
  t = t.replace(/\s*\bsemicolon\b\s*/gi, '; ');
  t = t.replace(/\s*\b(?:dash|em dash|long dash)\b\s*/gi, ' — ');
  t = t.replace(/\s*\b(?:hyphen|short dash)\b\s*/gi, '-');
  t = t.replace(/\s*\b(?:forward slash|slash)\b\s*/gi, '/');
  t = t.replace(/\s*\b(?:open paren(?:thesis)?|left paren(?:thesis)?)\b\s*/gi, ' (');
  t = t.replace(/\s*\b(?:close paren(?:thesis)?|right paren(?:thesis)?|end paren(?:thesis)?)\b\s*/gi, ') ');
  t = t.replace(/\s*\b(?:open bracket|left bracket)\b\s*/gi, ' [');
  t = t.replace(/\s*\b(?:close bracket|right bracket|end bracket)\b\s*/gi, '] ');
  t = t.replace(/\s*\b(?:open quote|begin quote)\b\s*/gi, ' "');
  t = t.replace(/\s*\b(?:close quote|end quote|unquote)\b\s*/gi, '" ');
  t = t.replace(/\s*\b(?:new paragraph|next paragraph|paragraph break)\b\s*/gi, '\n\n');
  t = t.replace(/\s*\b(?:new line|newline|next line|line break)\b\s*/gi, '\n');
  t = t.replace(/\s*\b(?:tab|indent)\b\s*/gi, '\t');
  t = t.replace(/\s*\b(?:bullet point|bullet)\b\s*/gi, '\n• ');
  t = t.replace(/\s*\b(?:number sign|hashtag|pound sign)\b\s*/gi, '#');
  t = t.replace(/\s*\b(?:at sign)\b\s*/gi, '@');
  t = t.replace(/\s*\b(?:ampersand|and sign)\b\s*/gi, ' & ');
  t = t.replace(/\s*\b(?:plus sign)\b\s*/gi, ' + ');
  t = t.replace(/\s*\b(?:minus sign)\b\s*/gi, ' - ');
  t = t.replace(/\s*\b(?:equals sign|equal sign)\b\s*/gi, ' = ');
  t = t.replace(/\s*\b(?:percent sign|percent)\b(?!\s*(?:of|or|and|is|was|were|are|in|at|from))\s*/gi, '% ');
  t = t.replace(/\s*\b(?:degree|degrees)\b\s*/gi, '° ');
  t = t.replace(/\s*\b(?:times sign|multiplication sign)\b\s*/gi, ' × ');
  t = t.replace(/\s*\b(?:greater than sign|greater than)\b\s*/gi, ' > ');
  t = t.replace(/\s*\b(?:less than sign|less than)\b\s*/gi, ' < ');

  // Step 4: Cleanup
  t = t.replace(/,\s*([.!?;:\n])/g, '$1');
  t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
  t = t.replace(/(\n\s*)([a-z])/g, (_, n, l) => n + l.toUpperCase());
  t = t.replace(/ {2,}/g, ' ');
  return t.trim();
}
