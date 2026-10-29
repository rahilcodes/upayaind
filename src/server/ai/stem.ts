/**
 * Porter stemmer (M. F. Porter, 1980) + tokeniser used by the deterministic ATS
 * score (SPEC §9.5) and the truthfulness validator. Pure, no network, no deps.
 */

const isConsonant = (w: string, i: number): boolean => {
  const c = w[i];
  if (c === "a" || c === "e" || c === "i" || c === "o" || c === "u") return false;
  if (c === "y") return i === 0 ? true : !isConsonant(w, i - 1);
  return true;
};

/** m() = number of VC sequences in w[0..j]. */
function measure(w: string, j: number): number {
  let n = 0;
  let i = 0;
  while (true) {
    if (i > j) return n;
    if (!isConsonant(w, i)) break;
    i++;
  }
  i++;
  while (true) {
    while (true) {
      if (i > j) return n;
      if (isConsonant(w, i)) break;
      i++;
    }
    i++;
    n++;
    while (true) {
      if (i > j) return n;
      if (!isConsonant(w, i)) break;
      i++;
    }
    i++;
  }
}

const vowelInStem = (w: string, j: number) => {
  for (let i = 0; i <= j; i++) if (!isConsonant(w, i)) return true;
  return false;
};
const doubleC = (w: string, j: number) => j >= 1 && w[j] === w[j - 1] && isConsonant(w, j);
const cvc = (w: string, i: number) => {
  if (i < 2 || !isConsonant(w, i) || isConsonant(w, i - 1) || !isConsonant(w, i - 2)) return false;
  const c = w[i];
  return !(c === "w" || c === "x" || c === "y");
};

export function porterStem(input: string): string {
  let w = input.toLowerCase();
  if (w.length <= 2 || !/^[a-z]+$/.test(w)) return w;

  const ends = (s: string) => w.endsWith(s);
  const stemEnd = (s: string) => w.length - s.length - 1; // index of last char of stem
  const replaceIf = (suffix: string, rep: string, minM: number) => {
    if (ends(suffix) && measure(w, stemEnd(suffix)) > minM) {
      w = w.slice(0, w.length - suffix.length) + rep;
      return true;
    }
    return ends(suffix);
  };

  // Step 1a
  if (ends("sses")) w = w.slice(0, -2);
  else if (ends("ies")) w = w.slice(0, -2);
  else if (!ends("ss") && ends("s")) w = w.slice(0, -1);

  // Step 1b
  let step1bExtra = false;
  if (ends("eed")) {
    if (measure(w, stemEnd("eed")) > 0) w = w.slice(0, -1);
  } else if (ends("ed") && vowelInStem(w, stemEnd("ed"))) {
    w = w.slice(0, -2);
    step1bExtra = true;
  } else if (ends("ing") && vowelInStem(w, stemEnd("ing"))) {
    w = w.slice(0, -3);
    step1bExtra = true;
  }
  if (step1bExtra) {
    if (ends("at") || ends("bl") || ends("iz")) w += "e";
    else if (doubleC(w, w.length - 1) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w, w.length - 1) === 1 && cvc(w, w.length - 1)) w += "e";
  }

  // Step 1c
  if (ends("y") && vowelInStem(w, w.length - 2)) w = w.slice(0, -1) + "i";

  // Step 2
  const step2: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"], ["izer", "ize"], ["bli", "ble"],
    ["alli", "al"], ["entli", "ent"], ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"], ["ousness", "ous"], ["aliti", "al"],
    ["iviti", "ive"], ["biliti", "ble"], ["logi", "log"],
  ];
  for (const [s, r] of step2) if (ends(s)) { replaceIf(s, r, 0); break; }

  // Step 3
  const step3: [string, string][] = [["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"], ["ical", "ic"], ["ful", ""], ["ness", ""]];
  for (const [s, r] of step3) if (ends(s)) { replaceIf(s, r, 0); break; }

  // Step 4
  const step4 = ["al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement", "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize"];
  for (const s of step4) {
    if (!ends(s)) continue;
    const j = stemEnd(s);
    if (measure(w, j) > 1) {
      if (s === "ion") {
        if (j >= 0 && (w[j] === "s" || w[j] === "t")) w = w.slice(0, j + 1);
      } else w = w.slice(0, j + 1);
    }
    break;
  }

  // Step 5a
  if (ends("e")) {
    const m = measure(w, w.length - 2);
    if (m > 1 || (m === 1 && !cvc(w, w.length - 2))) w = w.slice(0, -1);
  }
  // Step 5b
  if (measure(w, w.length - 1) > 1 && doubleC(w, w.length - 1) && w.endsWith("l")) w = w.slice(0, -1);
  return w;
}

/** British → American spelling for matching ("optimised" ≡ "optimized"). */
function unifySpelling(t: string): string {
  return t.replace(/is(e|ed|es|ing|ation|ations|er|ers)$/, "iz$1").replace(/our$/, "or").replace(/yse$/, "yze").replace(/tre$/, "ter");
}

/**
 * Lower-case tokens; keeps tech tokens like "c++", "c#", ".net", "node.js".
 * Splits on whitespace and punctuation except the characters those need.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const t = raw.replace(/^\.+(?!net\b)/, "").replace(/\.+$/, "");
    if (!t) continue;
    out.push(t);
  }
  return out;
}

const STOP = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "with", "or", "at", "by", "as", "&"]);

/** Stem one token (tech tokens with symbols/digits are kept as-is). */
export function stemToken(t: string): string {
  if (/[^a-z]/.test(t)) return t;
  return porterStem(unifySpelling(t));
}

export function stemmedTokens(text: string, opts: { dropStopwords?: boolean } = {}): string[] {
  const toks = tokenize(normalizeAliases(text));
  return (opts.dropStopwords ? toks.filter((t) => !STOP.has(t)) : toks).map(stemToken);
}

/**
 * Equivalent spellings / abbreviations an ATS treats as one skill. Applied to
 * both the JD terms and the resume text before stemming, so "JavaScript" in the
 * JD matches "JS" in a resume (and vice versa). Lower-case, longest form first.
 */
const ALIASES: [string, string][] = [
  ["javascript", "js"], ["typescript", "ts"], ["postgresql", "postgres"], ["microsoft excel", "excel"], ["ms excel", "excel"], ["microsoft office", "ms office"],
  ["microsoft power bi", "power bi"], ["powerbi", "power bi"], ["machine learning", "ml"], ["artificial intelligence", "ai"], ["ai/ml", "ai ml"], ["ml/ai", "ai ml"],
  ["natural language processing", "nlp"], ["kubernetes", "k8s"], ["google cloud platform", "gcp"], ["google cloud", "gcp"], ["amazon web services", "aws"],
  ["microsoft azure", "azure"], ["reactjs", "react.js"], ["nodejs", "node.js"], ["vuejs", "vue.js"], ["nextjs", "next.js"],
  ["ci/cd", "cicd"], ["ci cd", "cicd"], ["continuous integration", "cicd"], ["rest api", "rest"], ["restful api", "rest"], ["restful", "rest"], ["user experience", "ux"],
  ["user interface", "ui"], ["quality assurance", "qa"], ["business intelligence", "bi"], ["customer relationship management", "crm"], ["search engine optimization", "seo"],
  ["search engine optimisation", "seo"], ["structured query language", "sql"], ["ms sql", "sql server"], ["mssql", "sql server"], ["microsoft sql server", "sql server"],
  ["servicenow", "service now"], ["github actions", "github"], ["a/b testing", "ab testing"], ["a/b test", "ab testing"], ["e-commerce", "ecommerce"],
  ["selenium webdriver", "selenium"], ["test automation", "automation testing"], ["automated testing", "automation testing"], ["unit testing", "unit tests"],
  ["etl pipelines", "etl"], ["data pipelines", "etl"], ["object oriented programming", "oop"], ["object-oriented", "oop"], ["scikit-learn", "sklearn"], ["scikit learn", "sklearn"],
  ["tensorflow", "tf"], ["pytorch", "torch"], ["large language models", "llm"], ["llms", "llm"], ["generative ai", "genai"], ["gen ai", "genai"],
];

/** Replace every alias by its canonical short form (longest alias first so "microsoft excel" wins over "excel"). */
export function normalizeAliases(text: string): string {
  let out = ` ${text.toLowerCase()} `;
  for (const [from, to] of ALIASES.slice().sort((a, b) => b[0].length - a[0].length)) {
    const esc = from.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, "g"), to);
  }
  return out.trim();
}

/** Does `phrase` occur (as consecutive stemmed tokens) in the haystack token list? */
export function containsPhrase(haystack: string[], phrase: string[]): boolean {
  if (!phrase.length) return false;
  outer: for (let i = 0; i + phrase.length <= haystack.length; i++) {
    for (let k = 0; k < phrase.length; k++) if (haystack[i + k] !== phrase[k]) continue outer;
    return true;
  }
  return false;
}

/**
 * Coverage of a multi-word phrase: 1 when the whole phrase occurs, otherwise
 * the share of its distinct tokens that occur anywhere (only for phrases of 3+
 * tokens, and only when at least half are present — e.g. "data visualization
 * dashboards" with "dashboards" and "data" present scores 0.67).
 */
export function phraseCoverage(haystack: string[], phrase: string[]): number {
  if (containsPhrase(haystack, phrase)) return 1;
  if (phrase.length < 3) return 0;
  const set = new Set(haystack);
  const distinct = [...new Set(phrase)];
  const hit = distinct.filter((t) => set.has(t)).length;
  return hit * 2 >= distinct.length ? Math.round((hit / distinct.length) * 100) / 100 : 0;
}
