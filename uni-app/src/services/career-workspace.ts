/** 青穗集 · 移动职业数据：分区读取、来源隔离、版本冲突刷新与过期请求保护。 */
import { ref, shallowRef } from "vue";
import { onHide, onShow, onUnload, onPullDownRefresh } from "@dcloudio/uni-app";
import { careerApi, getToken, goToAuth, type CareerView } from "./api";
import { careerSource, setCareerSource } from "./career-context";
import { developmentApi, type LearningState, type PreparationState, type LearningChange, type PreparationChange } from "./career-development";
import { errorText } from "./workspace";

export function useCareerWorkspace(sections: Array<"learning" | "preparation"> = ["learning", "preparation"]) {
  const source = ref(careerSource()), career = shallowRef<CareerView | null>(null);
  const learning = shallowRef<LearningState | null>(null), preparation = shallowRef<PreparationState | null>(null);
  const loading = ref(false), saving = ref(false), errors = ref({ career: "", learning: "", preparation: "" });
  let generation = 0, owner: string | null = null;
  function reset() { career.value = null; learning.value = null; preparation.value = null; errors.value = { career: "", learning: "", preparation: "" }; }
  async function refresh() {
    const token = getToken(), selected = source.value, current = ++generation;
    if (!token) { reset(); loading.value = false; goToAuth(); return; }
    if (owner !== token) reset();
    owner = token;
    loading.value = true;
    const valid = () => generation === current && token === getToken() && selected === source.value;
    const jobs: Array<Promise<unknown>> = [careerApi.view(selected)];
    if (selected === "cloud") sections.forEach(key => jobs.push(developmentApi[key]()));
    else { learning.value = null; preparation.value = null; }
    const results = await Promise.allSettled(jobs);
    if (!valid()) return;
    const nextErrors = { career: "", learning: "", preparation: "" };
    const keys = ["career", ...sections] as const;
    results.forEach((result, index) => {
      const key = keys[index];
      if (result.status === "rejected") { nextErrors[key] = errorText(result.reason); return; }
      try {
        const value = result.value as any;
        if (key === "career") {
          if (!value?.profile || ["goal", "education", "experience"].some(key => typeof value.profile[key] !== "string") || ["jobs", "actions", "comparisons", "proposals"].some(key => !Array.isArray(value[key]))) throw new Error("职业资料格式有误，请重试。");
          career.value = value;
        } else if (key === "learning") {
          if (!Number.isInteger(value?.revision) || !Array.isArray(value.paths) || value.paths.some((path: any) => !Array.isArray(path.nodes)) || (value.proposal && !Array.isArray(value.proposal.path?.nodes))) throw new Error("学习路线暂时不可用，请重试。");
          learning.value = value;
        } else {
          if (!Number.isInteger(value?.revision) || !Array.isArray(value.sessions) || !Array.isArray(value.boards) || value.sessions.some((session: any) => !Array.isArray(session.questions) || !Array.isArray(session.answers) || session.total < 1) || value.boards.some((board: any) => !Array.isArray(board.options) || !Array.isArray(board.backup_job_ids))) throw new Error("训练与比较记录暂时不可用，请重试。");
          preparation.value = value;
        }
      } catch (error) { nextErrors[key] = errorText(error); }
    });
    errors.value = nextErrors;
    loading.value = false;
  }
  function changeSource(value: string) {
    source.value = value; setCareerSource(value); reset(); void refresh();
  }
  async function change(kind: "learning" | "preparation", value: LearningChange | PreparationChange) {
    if (saving.value || loading.value || source.value !== "cloud") return false;
    const state = kind === "learning" ? learning.value : preparation.value;
    if (!state) return false;
    const token = getToken(), selected = source.value, current = generation;
    saving.value = true;
    try {
      const result = kind === "learning"
        ? await developmentApi.changeLearning(state.revision, value as LearningChange)
        : await developmentApi.changePreparation(state.revision, value as PreparationChange);
      if (token !== getToken() || selected !== source.value || current !== generation) return false;
      if (kind === "learning") learning.value = result as LearningState;
      else preparation.value = result as PreparationState;
      errors.value = { ...errors.value, [kind]: "" };
      return true;
    } catch (error) {
      if (token === getToken() && selected === source.value && current === generation) {
        await refresh();
        if (token === getToken() && selected === source.value) errors.value = { ...errors.value, [kind]: errorText(error) };
      }
      return false;
    } finally { saving.value = false; }
  }
  onShow(() => {
    const selected = careerSource();
    if (source.value !== selected || owner !== getToken()) reset();
    source.value = selected; void refresh();
  });
  const stop = () => { generation++; loading.value = false; };
  onHide(stop); onUnload(stop);
  onPullDownRefresh(async () => { try { await refresh(); } finally { uni.stopPullDownRefresh(); } });
  return { source, career, learning, preparation, loading, saving, errors, refresh, changeSource,
    changeLearning: (value: LearningChange) => change("learning", value),
    changePreparation: (value: PreparationChange) => change("preparation", value) };
}
