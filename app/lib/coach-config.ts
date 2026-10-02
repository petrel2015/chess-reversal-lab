// AI 教练设置：只保存在用户浏览器的 localStorage，请求直连用户配置的服务商，
// 本项目服务器不参与中转。
const STORAGE_KEY = "coach.settings.v1";

export type CoachSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  autoBrief: boolean;
};

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
  apiKey: "",
  model: "glm-5.3-flashx",
  // 自动简评默认关闭：开启后每走一步都会发起一次请求，消耗用户自己的额度
  autoBrief: false,
};

export function loadCoachSettings(): CoachSettings {
  if (typeof window === "undefined") return { ...DEFAULT_COACH_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COACH_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CoachSettings>;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl
          : DEFAULT_COACH_SETTINGS.baseUrl,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model:
        typeof parsed.model === "string" && parsed.model.trim()
          ? parsed.model
          : DEFAULT_COACH_SETTINGS.model,
      autoBrief: parsed.autoBrief === true,
    };
  } catch {
    // 损坏的存储或隐私模式：退回默认值
    return { ...DEFAULT_COACH_SETTINGS };
  }
}

// 返回是否写入成功：隐私模式 / 存储被禁用时失败，调用方需向用户提示
export function saveCoachSettings(settings: CoachSettings): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function isCoachConfigured(settings: CoachSettings): boolean {
  return Boolean(
    settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim(),
  );
}
