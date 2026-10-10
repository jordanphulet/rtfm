export interface Manual {
  id: string;
  title: string;
  subtitle: string;
  voice: string;          // writing-style brief for the (future) LLM; the reader may ignore it
  chapters: Chapter[];
  appendices: Chapter[];  // same shape as chapters, lettered A, B, …
}

export interface Chapter {
  id: string;
  label: string;          // "3" for chapters, "B" for appendices
  title: string;
  sections: Section[];
}

export interface Section {
  id: string;
  label: string;          // "3.2" or "B.1"
  title: string;
  summary: string;        // one line, always available (it comes with the TOC)
  status: "unwritten" | "writing" | "written";
  body: string;           // markdown; only shown once the section is written or streaming
}
