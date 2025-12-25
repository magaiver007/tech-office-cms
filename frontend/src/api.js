const API_BASE = "http://localhost:4000";

export async function api(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}
