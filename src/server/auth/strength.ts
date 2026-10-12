import "server-only";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";

let factory: ZxcvbnFactory | null = null;
function get() {
  factory ??= new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...en.dictionary },
    graphs: common.adjacencyGraphs,
    translations: en.translations,
  });
  return factory;
}

/** zxcvbn score 0–4; signup requires ≥ 2 (SPEC F1). */
export function passwordStrength(password: string, userInputs: string[] = []) {
  const r = get().check(password, userInputs);
  return { score: r.score, warning: r.feedback.warning ?? "", suggestions: r.feedback.suggestions };
}
