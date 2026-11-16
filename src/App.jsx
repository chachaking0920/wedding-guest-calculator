import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

/* 💒 웨딩홀 보증인원 & 하객수 계산기 — React + Tailwind + lucide-react 단일 컴포넌트
 * 인원수는 동반인까지 포함해 입력하는 것을 전제로 함 */

const CATEGORIES = [
  { key: 'family',    label: '가족',       rate: 95 },
  { key: 'relatives', label: '친척',       rate: 80 },
  { key: 'bestie',    label: '친한 친구',  rate: 85 },
  { key: 'friends',   label: '지인',       rate: 45 },
  { key: 'work',      label: '직장 동료',  rate: 50 },
  { key: 'parents',   label: '부모님 하객', rate: 65 },
];

const REGIONS = [
  { key: 'same', label: '동일 지역', adj: 0 },
  { key: 'far',  label: '타지 이동', adj: -15 },
];

const TIMES = [
  { key: 'golden', label: '토 골든타임',     adj: 5 },
  { key: 'base',   label: '토 오후, 일 점심', adj: 0 },
  { key: 'late',   label: '일 15시 이후, 연휴', adj: -10 },
];

const SIDE_LABEL = { groom: '신랑측', bride: '신부측' };
const GUARANTEE_RATIO = 0.88; // 50명 단위로 맞출 수 없을 때 쓰는 기준 비율
const BUFFER_RATIO = 0.15;    // 웨딩홀 당일 여유 식사
const UNIT = 50;              // 보증인원 계약 단위

/** 식사 인원 → 보증인원 (50명 단위)
 * 1) 안전 구간: [식사 ÷ 1.15, 식사]
 *    - 하한: 보증 × 1.15(여유분)로 예상 식사를 모두 커버
 *    - 상한: 보증이 식사를 넘지 않음(빈 식대 지불 방지)
 * 2) 구간 안에 50의 배수가 있으면 그중 가장 작은 값(보수적 계약)
 * 3) 없으면 식사 × 88%에 가장 가까운 50의 배수
 * 4) 하객이 있으면 최소 50명 */
export function toGuarantee(meals) {
  if (meals <= 0) return 0;
  let g = Math.ceil(meals / (1 + BUFFER_RATIO) / UNIT) * UNIT;
  if (g > meals) g = Math.round((meals * GUARANTEE_RATIO) / UNIT) * UNIT;
  return Math.max(UNIT, g);
}
const STORAGE_KEY = 'wedding-guest-calc-v3';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

/* ---------- 상태 & 계산 ---------- */

function defaultSide() {
  const items = {};
  CATEGORIES.forEach((c) => { items[c.key] = { count: 0, rate: c.rate }; });
  return { region: 'same', items };
}

function defaultState() {
  return { groom: defaultSide(), bride: defaultSide(), time: 'base', noMeal: 10 };
}

function sanitizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  ['groom', 'bride'].forEach((side) => {
    const s = raw[side];
    if (!s || typeof s !== 'object') return;
    if (REGIONS.some((r) => r.key === s.region)) base[side].region = s.region;
    CATEGORIES.forEach((c) => {
      const it = s.items && s.items[c.key];
      if (!it) return;
      if (Number.isFinite(it.count)) base[side].items[c.key].count = clamp(Math.round(it.count), 0, 999);
      if (Number.isFinite(it.rate)) base[side].items[c.key].rate = clamp(Math.round(it.rate), 0, 100);
    });
  });
  if (TIMES.some((t) => t.key === raw.time)) base.time = raw.time;
  if (Number.isFinite(raw.noMeal)) base.noMeal = clamp(Math.round(raw.noMeal), 0, 100);
  return base;
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? sanitizeState(JSON.parse(saved)) : defaultState();
  } catch (e) {
    return defaultState();
  }
}

/** 적용 참석률 = 참석률 + 지역 보정 + 시간대 보정 (0~100%) */
export function calcSide(side, timeAdj, noMeal) {
  const regionAdj = (REGIONS.find((r) => r.key === side.region) || REGIONS[0]).adj;
  let invited = 0;
  let visitors = 0;
  const rows = {};
  CATEGORIES.forEach((c) => {
    const it = side.items[c.key];
    const eff = clamp(it.rate + regionAdj + timeAdj, 0, 100);
    const v = it.count * (eff / 100);
    invited += it.count;
    visitors += v;
    rows[c.key] = { eff, visitors: v };
  });
  return { invited, visitors, meals: visitors * (1 - noMeal / 100), rows };
}

export function calcAll(state) {
  const timeAdj = (TIMES.find((t) => t.key === state.time) || TIMES[1]).adj;
  const groom = calcSide(state.groom, timeAdj, state.noMeal);
  const bride = calcSide(state.bride, timeAdj, state.noMeal);
  const total = groom.visitors + bride.visitors;
  const meals = Math.round(total * (1 - state.noMeal / 100));
  const guarantee = toGuarantee(meals);
  return {
    groom, bride,
    invited: groom.invited + bride.invited,
    visitors: Math.round(total),
    meals,
    guarantee,
    maxCapacity: Math.round(guarantee * (1 + BUFFER_RATIO)),
  };
}

/* ---------- UI 조각 ---------- */

/** 숫자만 받는 인라인 입력 */
function NumInput({ value, onChange, max, suffix, ariaLabel, compact = false }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (raw) => {
    const n = parseInt(raw, 10);
    onChange(Number.isFinite(n) ? clamp(n, 0, max) : 0);
  };
  return (
    <label className={`inline-flex items-baseline ${compact ? 'ml-1' : 'shrink-0 rounded-full bg-white px-2.5 py-1.5 sm:px-3'}`}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9]/g, '').slice(0, String(max).length);
          setDraft(cleaned);
          if (cleaned !== '') commit(cleaned);
        }}
        onBlur={() => commit(draft)}
        className={`bg-transparent text-right tabular-nums outline-none ${compact ? 'w-6 font-medium text-neutral-500' : 'w-8 font-semibold text-neutral-900 sm:w-9'}`}
      />
      <span className={`ml-0.5 text-neutral-400 ${compact ? 'text-xs' : 'text-sm'}`}>{suffix}</span>
    </label>
  );
}

function RangeSlider({ value, onChange, label }) {
  const shown = clamp(value, 0, 100);
  return (
    <input
      type="range"
      aria-label={label}
      className="wg-range w-full"
      min={0}
      max={100}
      value={shown}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ background: `linear-gradient(to right, #2A2A28 ${shown}%, #E4E2DD ${shown}%)` }}
    />
  );
}

function CategoryRow({ cat, item, eff, onChange }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-neutral-800 sm:text-[15px]">{cat.label}</span>
        <NumInput value={item.count} max={999} suffix="명" ariaLabel={`${cat.label} 인원수`}
          onChange={(count) => onChange({ count })} />
      </div>
      <div className="mt-1 flex items-baseline text-xs text-neutral-400">
        <span>참석</span>
        <NumInput value={item.rate} max={100} suffix="%" ariaLabel={`${cat.label} 참석률`} compact
          onChange={(rate) => onChange({ rate })} />
        {eff !== item.rate && <span className="ml-1 tabular-nums">→ {eff}%</span>}
      </div>
      <div className="mt-3">
        <RangeSlider value={item.count} label={`${cat.label} 인원`} onChange={(count) => onChange({ count })} />
      </div>
    </div>
  );
}

function SideCard({ sideKey, side, result, onItem }) {
  return (
    <section className="min-w-0 rounded-[24px] bg-[#EFEEEB] px-3 py-4 sm:rounded-[28px] sm:px-5">
      <header className="flex items-baseline justify-between pb-1">
        <h2 className="text-base font-semibold text-neutral-900 sm:text-lg">{SIDE_LABEL[sideKey]}</h2>
        <span className="text-sm tabular-nums text-neutral-500">{fmt(result.visitors)}명</span>
      </header>
      <div className="divide-y divide-[#E2E0DB]">
        {CATEGORIES.map((c) => (
          <CategoryRow key={c.key} cat={c} item={side.items[c.key]} eff={result.rows[c.key].eff}
            onChange={(patch) => onItem(c.key, patch)} />
        ))}
      </div>
    </section>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className={strong ? 'font-semibold text-neutral-900' : 'text-neutral-500'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-3xl font-bold text-neutral-900' : 'text-lg font-semibold text-neutral-800'}`}>
        {value}<span className="ml-0.5 text-sm font-normal text-neutral-400">명</span>
      </span>
    </div>
  );
}

/* ---------- 메인 ---------- */

export default function WeddingGuestCalculator() {
  const [state, setState] = useState(loadState);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dashVisible, setDashVisible] = useState(false);
  const dashRef = useRef(null);

  const res = useMemo(() => calcAll(state), [state]);
  const hasInput = res.invited > 0;

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }, [state]);

  useEffect(() => {
    const el = dashRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setDashVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!confirmReset) return undefined;
    const t = setTimeout(() => setConfirmReset(false), 3000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const updateItem = (sideKey, catKey, patch) =>
    setState((s) => ({
      ...s,
      [sideKey]: { ...s[sideKey], items: { ...s[sideKey].items, [catKey]: { ...s[sideKey].items[catKey], ...patch } } },
    }));

  const buildCopyText = () => {
    const line = (k) =>
      `${SIDE_LABEL[k]}${state[k].region === 'far' ? '(타지)' : ''} 초대 ${fmt(res[k].invited)} → 방문 ${fmt(res[k].visitors)} → 식사 ${fmt(res[k].meals)}`;
    return [
      '💒 웨딩홀 보증인원 계산',
      line('groom'),
      line('bride'),
      `예식 시간: ${TIMES.find((t) => t.key === state.time).label} / 식사 안 함 ${state.noMeal}%`,
      '',
      `초대 ${fmt(res.invited)}명, 예상 하객 ${fmt(res.visitors)}명, 식사 ${fmt(res.meals)}명`,
      `추천 보증인원 ${fmt(res.guarantee)}명 (최대 ${fmt(res.maxCapacity)}명)`,
    ].join('\n');
  };

  const handleCopy = async () => {
    const text = buildCopyText();
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) { ok = false; }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setState(defaultState());
    setConfirmReset(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
        .wg-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 9999px; outline: none; cursor: pointer; }
        .wg-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; border-radius: 9999px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18), 0 0 0 0.5px rgba(0,0,0,.06); }
        .wg-range::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 9999px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
      `}</style>

      <div className="mx-auto max-w-5xl px-3 pb-28 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">💒 웨딩홀 보증인원 &amp; 하객수 계산기</h1>

        <div className="mt-8 grid grid-cols-2 gap-2 sm:gap-4">
          {['groom', 'bride'].map((k) => (
            <SideCard key={k} sideKey={k} side={state[k]} result={res[k]}
              onItem={(cat, patch) => updateItem(k, cat, patch)} />
          ))}
        </div>

        {/* 공용 옵션 */}
        <section className="mt-4 space-y-4 rounded-[28px] bg-[#EFEEEB] px-5 py-5">
          <div>
            <div className="mb-2 text-sm text-neutral-500">예식 시간</div>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-[#E4E2DD] p-1">
              {TIMES.map((t) => {
                const active = state.time === t.key;
                return (
                  <button key={t.key} type="button" aria-pressed={active}
                    onClick={() => setState((s) => ({ ...s, time: t.key }))}
                    className={`rounded-full px-2 py-2.5 text-[13px] transition sm:text-sm ${
                      active ? 'bg-white font-semibold text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">식사 안 하는 하객</span>
            <NumInput value={state.noMeal} max={100} suffix="%" ariaLabel="식사 안 하는 하객 비율"
              onChange={(noMeal) => setState((s) => ({ ...s, noMeal }))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {['groom', 'bride'].map((k) => {
              const checked = state[k].region === 'far';
              return (
                <label key={k}
                  className={`flex cursor-pointer select-none items-center gap-2.5 rounded-full px-4 py-3 text-sm transition ${
                    checked ? 'bg-[#E9DFD2] font-semibold text-neutral-900' : 'bg-white text-neutral-500'}`}>
                  <input type="checkbox" className="sr-only" checked={checked}
                    onChange={(e) => setState((s) => ({ ...s, [k]: { ...s[k], region: e.target.checked ? 'far' : 'same' } }))} />
                  <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-[1.5px] ${
                    checked ? 'border-neutral-900 bg-neutral-900' : 'border-neutral-300'}`}>
                    {checked && <Check size={12} strokeWidth={3} className="text-white" />}
                  </span>
                  {SIDE_LABEL[k]} 타지 이동
                </label>
              );
            })}
          </div>
        </section>

        {/* 결과 */}
        <section ref={dashRef} className="mt-4 scroll-mt-4 rounded-[28px] bg-[#EFEEEB] px-5 py-4">
          <div className="divide-y divide-[#E2E0DB]">
            <Row label="초대" value={fmt(res.invited)} />
            <Row label="예상 하객" value={fmt(res.visitors)} />
            <Row label="식사" value={fmt(res.meals)} />
          </div>

          <div className="mt-3 rounded-[22px] bg-[#E9DFD2] px-5 py-4">
            <Row label="추천 보증인원" value={fmt(res.guarantee)} strong />
            <div className="flex justify-between text-sm text-neutral-500">
              <span>당일 최대 (+15%)</span>
              <span className="tabular-nums">{fmt(res.maxCapacity)}명</span>
            </div>
          </div>

          {hasInput && (
            <p className="mt-3 px-1 text-sm leading-relaxed text-neutral-600">
              예상 식사 인원은 <b className="text-neutral-900">{fmt(res.meals)}명</b>이니 예식장에서{' '}
              <b className="text-neutral-900">{fmt(res.guarantee)}명</b>으로 계약하는 것을 추천드려요.
              대부분의 예식홀은 본식 2주 전 최종 조율 때 증액 가능해요.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={handleCopy} disabled={!hasInput}
              className="rounded-full bg-neutral-900 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-30">
              {copied ? '복사됨' : '복사'}
            </button>
            <button type="button" onClick={handleReset}
              className={`rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98] ${
                confirmReset ? 'bg-[#E9DFD2] text-neutral-900' : 'bg-white text-neutral-600'}`}>
              {confirmReset ? '한 번 더 누르면 초기화' : '초기화'}
            </button>
          </div>
        </section>

      </div>

      {/* 하단 고정 요약 */}
      <div className={`fixed inset-x-0 bottom-0 z-30 px-4 transition-all duration-300 ${
        dashVisible ? 'pointer-events-none translate-y-full opacity-0' : 'opacity-100'}`}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => dashRef.current && dashRef.current.scrollIntoView({ behavior: 'smooth' })}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-4 rounded-full bg-white px-5 py-3.5 text-sm shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          <span className="text-neutral-500">식사 <b className="tabular-nums text-neutral-900">{fmt(res.meals)}</b></span>
          <span className="h-4 w-px bg-neutral-200" />
          <span className="text-neutral-500">보증 <b className="tabular-nums text-neutral-900">{fmt(res.guarantee)}</b></span>
        </button>
      </div>
    </div>
  );
}
