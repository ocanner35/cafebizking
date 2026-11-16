import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Play, RotateCcw, Trophy, ChevronDown, X, Sparkles, Info, RefreshCw, Dices, Check, GripVertical, Crosshair, Users, Copy, LogIn, LogOut, Plus, UserPlus, Home, Settings, Database, BookOpen, PlugZap, Unplug } from "lucide-react";

type Suit = "Maça" | "Kupa" | "Karo" | "Sinek";
type RoundType = "Kız Almaz" | "Erkek Almaz" | "Kupa Almaz" | "Rıfkı" | "El Almaz" | "Son İki Almaz" | "Koz-Maça" | "Koz-Kupa" | "Koz-Karo" | "Koz-Sinek";
type CardT = { suit: Suit; rank: string; value: number; id: string };

const SUITS: Suit[] = ["Maça", "Kupa", "Karo", "Sinek"];
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const VALUES: Record<string, number> = { A:14,K:13,Q:12,J:11,"10":10,"9":9,"8":8,"7":7,"6":6,"5":5,"4":4,"3":3,"2":2 };
const NAMES = ["Sen","Bot Ege","Bot Deniz","Bot Ada"];
const AVATAR = ["S","E","D","A"];
const PENALTY_ROUNDS: RoundType[] = ["Kız Almaz","Erkek Almaz","Kupa Almaz","Rıfkı","El Almaz","Son İki Almaz"];
const TRUMP_ROUNDS: RoundType[] = ["Koz-Maça","Koz-Kupa","Koz-Karo","Koz-Sinek"];
const SHORT_CODE: Record<RoundType,string> = { "Kız Almaz":"KIZ","Erkek Almaz":"ERK","Kupa Almaz":"KUP","Rıfkı":"RIF","El Almaz":"EL","Son İki Almaz":"SON","Koz-Maça":"M","Koz-Kupa":"KU","Koz-Karo":"KA","Koz-Sinek":"S" };
const isPenaltyRoundType = (r: RoundType) => PENALTY_ROUNDS.includes(r);
/* BOT DISPLAY NAMES — never show an internal bot id (bot-1_<uuid>…) anywhere.
   Display is always the short name "Bot 1" / "Bot 2" / "Bot 3" (or the stored
   short displayName). The internal id stays internal. */
function shortBotNameForSeat(seat: number){ return `Bot ${seat + 1}`; }
/* A username that is exactly the account password is corrupted data
   (password saved into the username column). Never display it: the game
   label falls back to "Sen" for the owner / a neutral label for others. */
function isPasswordLikeUsername(name: string, password?: string){
  const n = String(name ?? "").trim();
  if(!n) return false;
  if(password && n === String(password)) return true;
  return false;
}
function isAllDigits(name: string){ return /^\d{4,}$/.test(String(name ?? "").trim()); }
function displayNameForSeatLike(s: { username?: string; displayName?: string; isBot?: boolean } | null | undefined, seat: number){
  if(!s) return shortBotNameForSeat(seat);
  const rawDisplay = String(s.displayName ?? "").trim();
  if(isAllDigits(rawDisplay) || isAllDigits(String(s.username ?? ""))) return "Sen";
  if(rawDisplay && !rawDisplay.startsWith("bot-") && rawDisplay.length <= 14) return rawDisplay;
  if(s.isBot || String(s.username ?? "").startsWith("bot-")) return shortBotNameForSeat(seat);
  return String(s.username ?? "").trim() || rawDisplay || shortBotNameForSeat(seat);
}
function displayPlayerName(name: string, seat: number){
  if(name.startsWith("bot-") && name.length > 10) return shortBotNameForSeat(seat);
  if(isAllDigits(name)) return "Sen";
  return name;
}
const ROUNDS: { name: RoundType; desc: string; score: string }[] = [
  { name:"Kız Almaz", desc:"Alınan her Kız ceza getirir. Kızları başkalarına yıkmaya çalış.", score:"Kız başına −100" },
  { name:"Erkek Almaz", desc:"Alınan her Vale ve Papaz ceza getirir.", score:"Vale / Papaz başına −60" },
  { name:"Kupa Almaz", desc:"Alınan her Kupa kartı ceza getirir.", score:"Kupa başına −30" },
  { name:"Rıfkı", desc:"Kupa Papazı'nı alan oyuncu büyük cezayı yer.", score:"Kupa Papazı: −320" },
  { name:"El Almaz", desc:"Kazanılan her el ceza getirir. Elden kaçmak gerekir.", score:"El başına −50" },
  { name:"Son İki Almaz", desc:"Sadece son iki el cezalıdır. 12. ve 13. elden kaç.", score:"12. el −180 • 13. el −180" },
  { name:"Koz-Maça", desc:"Maça kozdur. Koz, masadaki en güçlü karttır.", score:"El başına +50" },
  { name:"Koz-Kupa", desc:"Kupa kozdur. Koz, masadaki en güçlü karttır.", score:"El başına +50" },
  { name:"Koz-Karo", desc:"Karo kozdur. Koz, masadaki en güçlü karttır.", score:"El başına +50" },
  { name:"Koz-Sinek", desc:"Sinek kozdur. Koz, masadaki en güçlü karttır.", score:"El başına +50" },
];

async function callRecords(action: string, args: Record<string, unknown>){
  let response: Response;
  try {
    response = await fetch("actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, args }) });
  } catch (e) {
    // Keep the REAL underlying reason (network / backend unreachable) instead of a generic label.
    throw new Error(e instanceof Error ? e.message : "Bağlantı kurulamadı (fetch başarısız)");
  }
  let payload: { data?: unknown; error?: string } | null = null;
  let rawText = "";
  try {
    rawText = await response.text();
    payload = rawText ? (JSON.parse(rawText) as { data?: unknown; error?: string }) : null;
  } catch {
    payload = null;
  }
  if(!response.ok){
    // Surface the real backend error: e.g. "RLS policy", "duplicate key", "table not found".
    // If there is no structured error (e.g. HTML 404 in preview), say so explicitly
    // and keep it classified as a connection problem so demo mode can still work.
    if(payload?.error) throw new Error(`${payload.error} (HTTP ${response.status})`);
    const snippet = (rawText || response.statusText || "Bilinmeyen hata").replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`Bağlantı kurulamadı (HTTP ${response.status}): ${snippet}`);
  }
  if(payload?.error) throw new Error(payload.error);
  return payload?.data;
}
type BackendErrorKind = "rls" | "duplicate" | "missing-table" | "missing-column" | "limit" | "connection" | "unknown";
function classifyBackendError(raw: string): BackendErrorKind{
  const m = raw.toLowerCase();
  if(m.includes("row-level security") || m.includes("rls") || m.includes("permission denied") || m.includes("not authorized") || m.includes("policy") || m.includes("violates") && m.includes("policy")) return "rls";
  if(m.includes("duplicate") || m.includes("already exists") || m.includes("unique") || m.includes("idempotency key reused")) return "duplicate";
  if(m.includes("column does not exist") || m.includes("no such column") || m.includes("unknown column")) return "missing-column";
  if(m.includes("does not exist") || m.includes("not found") || m.includes("no such table") || m.includes("relation") || m.includes("table") && m.includes("yok")) return "missing-table";
  if(m.includes("limit reached") || m.includes("capacity") || m.includes("quota")) return "limit";
  if(m.includes("failed to fetch") || m.includes("networkerror") || m.includes("fetch") || m.includes("bağlantı kurulamadı") || m.includes("http 404") || m.includes("http 502") || m.includes("http 503") || m.includes("unexpected token") || m.includes("not a function") || m.includes("load failed")) return "connection";
  return "unknown";
}
function isConnectionError(raw: string){ return classifyBackendError(raw) === "connection"; }
function friendlyBackendError(raw: string, context: "register" | "login" | "read"): string{
  const kind = classifyBackendError(raw);
  if(kind === "rls") return "RLS hâlâ açık - yönetici panelindeki kurulum adımlarını uygula";
  if(kind === "duplicate") return "Bu kullanıcı adı alınmış, başka dene";
  if(kind === "missing-table") return "members tablosu yok - Kurulum SQL'ini çalıştır";
  if(kind === "missing-column") return `members tablosunda eksik sütun var (column does not exist) — Kurulum SQL'ini çalıştır. Hata: ${raw}`;
  if(kind === "limit") return `Kayıt limiti doldu: ${raw}`;
  if(kind === "connection") return context === "login" ? `Bağlantı kurulamadı — kayıtlar okunamadı. Hata: ${raw}` : `Bağlantı kurulamadı — kayıt yazılamadı. Hata: ${raw}`;
  return raw;
}
/* ============ GAME PACE / SPEED ============
   Readable pace (default = Normal): bot thinking 900ms, card fly
   600ms, trick collection 900ms. Turn indicator is visible for the
   full bot delay (>=600ms). Last played card glows for 700ms.
   The choice is saved through the records API (king-settings),
   never through browser storage. */
type SpeedKey = "slow" | "normal" | "fast";
const SPEED_PRESETS: Record<SpeedKey, { bot: number; card: number; collection: number; label: string }> = {
  slow: { bot: 1400, card: 900, collection: 1200, label: "Yavaş" },
  normal: { bot: 900, card: 600, collection: 900, label: "Normal" },
  fast: { bot: 500, card: 350, collection: 500, label: "Hızlı" },
};
const SPEED_KEYS: SpeedKey[] = ["slow", "normal", "fast"];
let speedStoreValue: SpeedKey = "normal";
let speedRecordId: string | null = null;
let speedLoaded = false;
const speedListeners = new Set<(v: SpeedKey) => void>();
function notifySpeed(){ speedListeners.forEach((fn) => fn(speedStoreValue)); }
async function persistGameSpeed(key: SpeedKey){
  try{
    const value = { type: "game-speed", speed: key, updatedAt: Date.now() };
    if(speedRecordId){ await callRecords("records.replace", { collection: "king-settings", id: speedRecordId, value }); return; }
    const created = await callRecords("records.create", { collection: "king-settings", value, idempotency_key: "game-speed" }) as { id?: string };
    if(created?.id) speedRecordId = created.id;
    else { const data = await callRecords("records.list", { collection: "king-settings" }) as { records?: { id: string; value?: { type?: string } }[] }; const rec = (Array.isArray(data?.records) ? data.records : []).find((r) => r?.value?.type === "game-speed"); if(rec?.id) speedRecordId = rec.id; }
  }catch{ /* speed stays in memory for this session; game never blocks on it */ }
}
function setGameSpeed(key: SpeedKey){
  if(speedStoreValue === key) return;
  speedStoreValue = key;
  notifySpeed();
  void persistGameSpeed(key);
}
async function loadGameSpeed(){
  if(speedLoaded) return; speedLoaded = true;
  try{
    const data = await callRecords("records.list", { collection: "king-settings" }) as { records?: { id: string; value?: { type?: string; speed?: string } }[] };
    const rec = (Array.isArray(data?.records) ? data.records : []).find((r) => r?.value?.type === "game-speed");
    if(rec){ speedRecordId = rec.id; const s = String(rec.value?.speed ?? ""); if(s === "slow" || s === "normal" || s === "fast"){ speedStoreValue = s as SpeedKey; notifySpeed(); } }
  }catch{ /* backend unavailable in preview: keep Normal in memory */ }
}
function useGameSpeed(){
  const [speed, setSpeedState] = useState<SpeedKey>(speedStoreValue);
  useEffect(() => { void loadGameSpeed(); const fn = (v: SpeedKey) => setSpeedState(v); speedListeners.add(fn); return () => { speedListeners.delete(fn); }; }, []);
  useEffect(() => { if(typeof document !== "undefined"){ const p = SPEED_PRESETS[speed]; document.documentElement.style.setProperty("--card-play-ms", `${p.card}ms`); document.documentElement.style.setProperty("--collect-ms", `${p.collection}ms`); } }, [speed]);
  return { speed, preset: SPEED_PRESETS[speed], setSpeed: setGameSpeed };
}
function SpeedControl(){
  const { speed, setSpeed } = useGameSpeed();
  return (
    <div className="flex items-center gap-1 bg-white/10 border border-white/15 rounded-md px-1.5 py-0.5" role="group" aria-label="Oyun hızı">
      <span className="text-[11px] font-bold text-white/80 whitespace-nowrap">Hız:</span>
      {SPEED_KEYS.map((k) => (
        <button key={k} type="button" onClick={() => setSpeed(k)} aria-pressed={speed === k} className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${speed === k ? "bg-[var(--gold)] text-black" : "text-white/80 hover:bg-white/10"}`}>{SPEED_PRESETS[k].label}</button>
      ))}
    </div>
  );
}
function useLastPlayedHighlight(trick: { player: number; card: CardT }[]){
  const [highlight, setHighlight] = useState<string | null>(null);
  const lastId = trick.length ? trick[trick.length - 1].card.id : null;
  useEffect(() => {
    if(!lastId) return;
    setHighlight(lastId);
    const t = setTimeout(() => setHighlight((cur) => cur === lastId ? null : cur), 700);
    return () => clearTimeout(t);
  }, [lastId]);
  return highlight;
}
function suitSymbol(s: Suit){ return s==="Maça"?"♠":s==="Kupa"?"♥":s==="Karo"?"♦":"♣"; }
function isRed(s: Suit){ return s==="Kupa"||s==="Karo"; }
function trumpOf(r: RoundType): Suit | null{
  if(r==="Koz-Maça") return "Maça"; if(r==="Koz-Kupa") return "Kupa"; if(r==="Koz-Karo") return "Karo"; if(r==="Koz-Sinek") return "Sinek"; return null;
}
function makeDeck(): CardT[]{
  const d: CardT[]=[];
  SUITS.forEach(s=>RANKS.forEach(r=>d.push({suit:s,rank:r,value:VALUES[r],id:`${s}-${r}`})));
  for(let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}
function sortHand(h: CardT[]){
  const order: Record<Suit, number> = { "Maça":0,"Kupa":1,"Karo":2,"Sinek":3 };
  return [...h].sort((a,b)=> order[a.suit]-order[b.suit] || b.value-a.value);
}
function sortHumanHand(h: CardT[]){
  const order: Record<Suit, number> = { "Kupa":0,"Maça":1,"Karo":2,"Sinek":3 };
  return [...h].sort((a,b)=> order[a.suit]-order[b.suit] || b.value-a.value);
}
type Stats = { tricks:number; queens:number; male:number; hearts:number; rifki:number; sonIki:number };
const emptyStats = (): Stats => ({tricks:0,queens:0,male:0,hearts:0,rifki:0,sonIki:0});
function scoreFor(s: Stats, r: RoundType): number{
  if(r==="Kız Almaz") return s.queens*-100;
  if(r==="Erkek Almaz") return s.male*-60;
  if(r==="Kupa Almaz") return s.hearts*-30;
  if(r==="Rıfkı") return s.rifki*-320;
  if(r==="El Almaz") return s.tricks*-50;
  if(r==="Son İki Almaz") return s.sonIki*-180;
  return s.tricks*50;
}
function computeFinalRoundScore(finalStats: Stats, finalTaken: CardT[], r: RoundType): number{
  if(r==="Kız Almaz") return finalTaken.filter(c=>c.rank==="Q").length * -100;
  if(r==="Erkek Almaz") return finalTaken.filter(c=>c.rank==="J"||c.rank==="K").length * -60;
  if(r==="Kupa Almaz") return finalTaken.filter(c=>c.suit==="Kupa").length * -30;
  if(r==="Rıfkı") return finalTaken.some(c=>c.suit==="Kupa"&&c.rank==="K") ? -320 : 0;
  if(r==="El Almaz") return finalStats.tricks * -50;
  if(r==="Son İki Almaz") return finalStats.sonIki * -180;
  return finalStats.tricks * 50;
}
function penaltyCardsFor(taken: CardT[], r: RoundType): CardT[]{
  if(r==="Kız Almaz") return taken.filter(c=>c.rank==="Q");
  if(r==="Erkek Almaz") return taken.filter(c=>c.rank==="J"||c.rank==="K");
  if(r==="Kupa Almaz") return taken.filter(c=>c.suit==="Kupa");
  if(r==="Rıfkı") return taken.filter(c=>c.suit==="Kupa"&&c.rank==="K");
  return [];
}
function isPenaltyCard(c: CardT, r: RoundType){
  if(r==="Kız Almaz") return c.rank==="Q";
  if(r==="Erkek Almaz") return c.rank==="J"||c.rank==="K";
  if(r==="Kupa Almaz") return c.suit==="Kupa";
  if(r==="Rıfkı") return c.suit==="Kupa"&&c.rank==="K";
  return false;
}
function penaltyValue(c: CardT, r: RoundType){
  if(r==="Kız Almaz") return c.rank==="Q" ? 100 : 0;
  if(r==="Erkek Almaz") return (c.rank==="J"||c.rank==="K") ? 60 : 0;
  if(r==="Kupa Almaz") return c.suit==="Kupa" ? 30 : 0;
  if(r==="Rıfkı") return (c.suit==="Kupa"&&c.rank==="K") ? 320 : 0;
  return 0;
}
function requiredTrumpLead(hand: CardT[], trump: Suit | null): CardT | null{
  if(!trump) return null;
  // Sequential A -> K -> Q rule for LEADING with trump: among the trio cards
  // still held, the highest-priority one must be led first. If the player
  // holds A, it must be A; otherwise if they hold K, it must be K;
  // otherwise if they hold only Q, it is Q. Holds no trio card -> no restriction.
  for(const rank of ["A","K","Q"]){
    const found = hand.find(c=>c.suit===trump && c.rank===rank);
    if(found) return found;
  }
  return null;
}
function hasTopTrump(hand: CardT[], trump: Suit | null){
  if(!trump) return false;
  // Correct Koz lead rule: ALL THREE together — A + K + Q of trump — are required.
  // Having only one or two of them (e.g. A+K without Q) is NOT enough to lead trump.
  return ["A","K","Q"].every(r=>hand.some(c=>c.suit===trump && c.rank===r));
}
function committedTrumpCard(hand: CardT[], trump: Suit | null): CardT | null{
  if(!trump) return null;
  // Commitment after opening trump with A: K first if still held,
  // otherwise Q if held (e.g. K already played / never held).
  // Holds neither -> no commitment, any trump is free.
  const k = hand.find(c=>c.suit===trump && c.rank==="K");
  if(k) return k;
  const q = hand.find(c=>c.suit===trump && c.rank==="Q");
  if(q) return q;
  return null;
}
function legalCards(hand: CardT[], lead: Suit | null, round?: RoundType, heartsBroken?: boolean, trumpBroken?: boolean, trick: {player:number; card:CardT}[] = [], isCommittedOpener = false){
  if(!lead){
    const trump = round ? trumpOf(round) : null;
    if(trump){
      if(trumpBroken){
        // AFTER trump is broken: the general A-K-Q rule does NOT apply.
        // ONLY the player who opened trump with A is committed, and
        // only when they CHOOSE to lead trump: K if held, else Q if
        // held. Leading a side suit is always free for everyone.
        // Everyone else is free to lead any trump or side suit.
        if(isCommittedOpener){
          const committed = committedTrumpCard(hand, trump);
          if(committed){
            const nonTrump = hand.filter(c=>c.suit!==trump);
            return [...nonTrump, committed];
          }
        }
        return hand;
      }
      const required = requiredTrumpLead(hand, trump);
      const onlyTrump = hand.length>0 && hand.every(c=>c.suit===trump);
      const hasFullTrio = hasTopTrump(hand, trump);
      // A-K-Q RULE — OPTIONAL / CONDITIONAL, ONLY BEFORE TRUMP IS BROKEN:
      // Leading a SIDE SUIT is completely FREE: no trio requirement,
      // no A-K-Q order, no forced trump. The rule applies ONLY if the
      // leader CHOOSES to lead trump: then they must hold the full
      // A+K+Q trio together, and must play the next trio card in
      // A -> K -> Q order. Without the full trio, trump may not be led
      // at all (unless the hand is only trump, when there is no side suit).
      if(onlyTrump){
        if(required) return [required];
        return hand;
      }
      const nonTrump = hand.filter(c=>c.suit!==trump);
      if(hasFullTrio && required){
        // All side-suit cards stay playable; only Trump A (the next
        // trio card) is playable among trump cards.
        return [...nonTrump, required];
      }
      return nonTrump.length ? nonTrump : hand;
    }
    if((round==="Kupa Almaz"||round==="Rıfkı") && !heartsBroken){
      const nonHearts = hand.filter(c=>c.suit!=="Kupa");
      if(nonHearts.length) return nonHearts;
    }
    return hand;
  }
  const trump = round ? trumpOf(round) : null;
  const same = hand.filter(c=>c.suit===lead);
  /* LED-SUIT RULE (bug fix — Koz: Sinek, açılan Maça Ası, elde Maça 9 + Papaz):
     Elinde açılan renk varsa, o renkteki HER kart oynanabilir — 9 da,
     Papaz da, As'ın altına atılsa da. Açılan renk koz DEĞİLSE asla
     "daha büyük kart oyna" zorunluluğu yoktur. Daha-büyük-kart kuralı
     SADECE açılan renk KOZ ise ve masada zaten koz varsa geçerlidir. */
  if(same.length){
    if(trump && lead===trump){
      const playedTrumps = trick.filter(t=>t.card.suit===trump);
      if(playedTrumps.length){
        const maxTrump = Math.max(...playedTrumps.map(t=>t.card.value));
        const higher = same.filter(c=>c.value>maxTrump);
        if(higher.length) return higher;
      }
    }
    return same;
  }
  if(trump){
    const trumpCards = hand.filter(c=>c.suit===trump);
    if(trumpCards.length){
      const playedTrumps = trick.filter(t=>t.card.suit===trump);
      if(playedTrumps.length){
        const maxTrump = Math.max(...playedTrumps.map(t=>t.card.value));
        const higher = trumpCards.filter(c=>c.value>maxTrump);
        if(higher.length) return higher;
      }
      return trumpCards;
    }
    return hand;
  }
  // KUPA ALMAZ — zorunlu kupa atma: açılan renkten yoksa ve elde kupa varsa,
  // yalnızca kupa atılabilir. Açılan renk kupa ise zaten renk takip edilir.
  if(round==="Kupa Almaz" && lead!=="Kupa"){
    const hasLead = hand.some(c=>c.suit===lead);
    if(!hasLead){
      const hearts = hand.filter(c=>c.suit==="Kupa");
      if(hearts.length) return hearts;
    }
  }
  // RIFKI — zorunlu kupa atma, Rıfkı muafiyetiyle: açılan renkten yoksa,
  // elde Rıfkı (Kupa Papazı) yoksa ve elde kupa varsa yalnızca kupa atılabilir.
  // Elinde Rıfkı varsa muaf: istediği kartı atabilir. Açılan renk kupa ise
  // normal renk takibi uygulanır. Kupa Almaz kuralı değişmedi, muafiyet yok.
  if(round==="Rıfkı" && lead!=="Kupa"){
    const hasLead = hand.some(c=>c.suit===lead);
    if(!hasLead){
      const holdsRifki = hand.some(c=>c.suit==="Kupa" && c.rank==="K");
      if(!holdsRifki){
        const hearts = hand.filter(c=>c.suit==="Kupa");
        if(hearts.length) return hearts;
      }
    }
  }
  // ERKEK ALMAZ — zorunlu erkek atma: açılan renkten yoksa ve elde
  // Vale (J) veya Papaz (K) varsa yalnızca erkek atılabilir. Muafiyet yok:
  // Kupa Papazı da erkektir, eldeyse yine erkek atmak zorunludur.
  if(round==="Erkek Almaz"){
    const hasLead = hand.some(c=>c.suit===lead);
    if(!hasLead){
      const erkek = hand.filter(c=>c.rank==="J" || c.rank==="K");
      if(erkek.length) return erkek;
    }
  }
  // KIZ ALMAZ — zorunlu kız atma: açılan renkten yoksa ve elde Kız (Q)
  // varsa yalnızca kız atılabilir.
  if(round==="Kız Almaz"){
    const hasLead = hand.some(c=>c.suit===lead);
    if(!hasLead){
      const kiz = hand.filter(c=>c.rank==="Q");
      if(kiz.length) return kiz;
    }
  }
  return same.length ? same : hand;
}
/* ---- BLOCKED-CARD EXPLANATION (why a clicked card did not play) ----
   The rules themselves never change here — this only explains them.
   Example: table has trump K, hand has trump A + 9, player clicks 9.
   legalCards() returns only [A], so 9 is blocked and the reason is:
   "Masada Papaz var, elinde As var — daha büyük kozu (As) oynamak
   zorundasın". mustCard is the card the player has to play. */
function rankNameTR(rank: string){ return rank==="A" ? "As" : rank==="K" ? "Papaz" : rank==="Q" ? "Kız" : rank==="J" ? "Vale" : rank; }
function cardNameTR(c: CardT){ return `${c.suit} ${rankNameTR(c.rank)}`; }
function explainBlockedCard(hand: CardT[], trick: {player:number; card:CardT}[], round: RoundType, heartsBroken: boolean, trumpBroken: boolean, opened: boolean, card: CardT): { reason: string; mustCard: CardT | null } | null{
  if(!hand.some((c) => c.id === card.id)) return null;
  const legal = legalCards(hand, trick.length ? trick[0].card.suit : null, round, heartsBroken, trumpBroken, trick, opened);
  if(legal.some((c) => c.id === card.id)) return null;
  const mustCard: CardT | null = legal.length ? [...legal].sort((a,b) => a.value - b.value)[0] : null;
  const trump = trumpOf(round);
  const lead = trick.length ? trick[0].card.suit : null;
  if(!lead){
    if(trump && !trumpBroken && card.suit === trump){
      /* "Asın altına Papaz" durumu: eli açarken elinde Sinek As varken
         Sinek Papaz atmak istedin. Koz açarken A-K-Q sırayla oynanır,
         önce As oynanır — Papaz, As'ın altına atılamaz. Bu, elin
         sadece kozdan oluşsa da böyledir (o zaman da sıradaki As'tır). */
      const onlyTrump = hand.length > 0 && hand.every((c) => c.suit === trump);
      if(!onlyTrump && !hasTopTrump(hand, trump)) return { reason: "Koz henüz açılmadı ve elinde A-K-Q üçlüsü yok — koz açamazsın, başka renk açmalısın.", mustCard };
      const req = requiredTrumpLead(hand, trump);
      if(req && req.id !== card.id) return { reason: `Koz açarken A-K-Q sırayla oynanır — elinde ${cardNameTR(req)} varken önce onu oynamalısın, ${cardNameTR(card)} onun altına atılamaz.`, mustCard: req };
    }
    if(trump && trumpBroken && opened && card.suit === trump){
      const committed = committedTrumpCard(hand, trump);
      if(committed && committed.id !== card.id) return { reason: `A ile kozu sen açtın — koz açarsan önce ${cardNameTR(committed)} oynamalısın, başka renk açmak serbest.`, mustCard: committed };
    }
    if((round === "Kupa Almaz" || round === "Rıfkı") && !heartsBroken && card.suit === "Kupa" && hand.some((c) => c.suit !== "Kupa")) return { reason: "Kupa henüz açılmadı — kupa ile başlayamazsın.", mustCard };
    return { reason: "Bu kart bu elde oynanamaz — oynayabileceğin kartlar altın çerçeveyle gösteriliyor.", mustCard };
  }
  if(trump){
    const playedTrumps = trick.filter((t) => t.card.suit === trump);
    if(playedTrumps.length){
      const maxCard = playedTrumps.reduce((a,b) => b.card.value > a.card.value ? b : a).card;
      const higher = hand.filter((c) => c.suit === trump && c.value > maxCard.value).sort((a,b) => a.value - b.value);
      if(higher.length && ((card.suit === trump && card.value <= maxCard.value) || (lead === trump && card.suit !== trump))){
        return { reason: `Masada ${cardNameTR(maxCard)} var, elinde ${cardNameTR(higher[0])} var — daha büyük kozu (${cardNameTR(higher[0])}) oynamak zorundasın.`, mustCard: higher[0] };
      }
      if(higher.length && lead !== trump && !hand.some((c) => c.suit === lead) && card.suit !== trump){
        return { reason: `Masada ${cardNameTR(maxCard)} var, elinde ${cardNameTR(higher[0])} var — daha büyük kozu (${cardNameTR(higher[0])}) oynamak zorundasın.`, mustCard: higher[0] };
      }
    }
  }
  if(hand.some((c) => c.suit === lead) && card.suit !== lead) return { reason: `Açılan renk ${lead} — elinde ${lead} var, ${lead} atmak zorundasın.`, mustCard };
  if(trump && !hand.some((c) => c.suit === lead) && hand.some((c) => c.suit === trump) && card.suit !== trump) return { reason: "Elinde açılan renk yok — koz atmak zorundasın.", mustCard };
  if(round === "Kupa Almaz" && lead !== "Kupa" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.suit === "Kupa") && card.suit !== "Kupa") return { reason: "Elinde açılan renk yok ve elinde kupa var — kupa atmak zorundasın!", mustCard };
  if(round === "Rıfkı" && lead !== "Kupa" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.suit === "Kupa") && card.suit !== "Kupa") return { reason: "Elinde açılan renk yok, elinde Rıfkı yok ve elinde kupa var — kupa atmak zorundasın!", mustCard };
  if(round === "Erkek Almaz" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.rank === "J" || c.rank === "K") && !(card.rank === "J" || card.rank === "K")) return { reason: "Elinde açılan renk yok ve elinde erkek var — erkek atmak zorundasın!", mustCard };
  if(round === "Kız Almaz" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.rank === "Q") && card.rank !== "Q") return { reason: "Elinde açılan renk yok ve elinde kız var — kız atmak zorundasın!", mustCard };
  return { reason: "Bu kart bu elde oynanamaz — oynayabileceğin kartlar altın çerçeveyle gösteriliyor.", mustCard };
}
/* 20-round Tabela: rows = rounds, columns = 4 players, totals at bottom,
   current round highlighted. History holds only finished rounds; the
   in-progress round shows its live estimate, future rounds show —. */
function ScoreboardTable({ names, history, totals, currentIndex, currentRound, currentScores }: { names: string[]; history: { round: RoundType; scores: number[]; chooser: number }[]; totals: number[]; currentIndex: number; currentRound: RoundType | null; currentScores: number[] }){
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead><tr className="bg-[#0f5b36] text-white"><th className="text-left px-2 py-2 font-extrabold">Tur</th><th className="text-left px-2 py-2 font-extrabold">Oyun</th>{names.map((n,i)=>(<th key={i} className="px-2 py-2 font-extrabold text-right whitespace-nowrap">{n}</th>))}</tr></thead>
        <tbody>
          {Array.from({ length: 20 }).map((_, i) => {
            const h = history[i];
            const isCurrent = i === currentIndex && currentRound !== null;
            return (
              <tr key={i} className={isCurrent ? "bg-[#FFF3C4] font-extrabold" : i % 2 ? "bg-black/[.03]" : "bg-white"}>
                <td className="px-2 py-1.5 font-extrabold">{i + 1}{isCurrent ? " • ▶" : ""}</td>
                <td className="px-2 py-1.5 font-bold whitespace-nowrap">{h ? h.round : isCurrent ? currentRound : "—"}</td>
                {names.map((_, pi) => (<td key={pi} className={`px-2 py-1.5 text-right font-black ${h ? (h.scores[pi] >= 0 ? "text-emerald-700" : "text-red-700") : ""}`}>{h ? (h.scores[pi] >= 0 ? `+${h.scores[pi]}` : h.scores[pi]) : isCurrent ? (currentScores[pi] >= 0 ? `+${currentScores[pi]}*` : `${currentScores[pi]}*`) : "—"}</td>))}
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr className="bg-[#0f5b36] text-white"><td className="px-2 py-2 font-extrabold" colSpan={2}>TOPLAM</td>{totals.map((t,i)=>(<td key={i} className="px-2 py-2 text-right font-black">{t >= 0 ? `+${t}` : t}</td>))}</tr></tfoot>
      </table>
      <p className="text-[10px] font-bold text-[#55645b] px-2 py-1">* Oynanan tur: tahmini puan, tur bitince toplama eklenir.</p>
    </div>
  );
}
function trickWinner(trick: {player:number; card:CardT}[], lead: Suit, trump: Suit | null){
  let win = 0;
  trick.forEach((t,i)=>{
    const cur = trick[win].card, nxt = t.card;
    const curTrump = trump && cur.suit===trump, nxtTrump = trump && nxt.suit===trump;
    if(nxtTrump && !curTrump) win=i;
    else if(nxtTrump===curTrump && nxt.suit===cur.suit && nxt.value>cur.value) win=i;
    else if(!curTrump && !nxtTrump && nxt.suit===lead && cur.suit!==lead) win=i;
    else if(!curTrump && !nxtTrump && nxt.suit===lead && cur.suit===lead && nxt.value>cur.value) win=i;
  });
  return trick[win].player;
}
function beats(card: CardT, current: CardT | null, lead: Suit, trump: Suit|null){
  if(!current) return true;
  if(trump && card.suit===trump && current.suit!==trump) return true;
  if(trump && card.suit===trump && current.suit===trump) return card.value>current.value;
  if(card.suit===lead && current.suit!==lead && !(trump && current.suit===trump)) return true;
  return card.suit===current.suit && card.value>current.value;
}
function penaltyRemaining(stats: Stats[], round: RoundType): number | null{
  const totalQ = stats.reduce((a,s)=>a+s.queens,0);
  const totalM = stats.reduce((a,s)=>a+s.male,0);
  const totalH = stats.reduce((a,s)=>a+s.hearts,0);
  const totalR = stats.reduce((a,s)=>a+s.rifki,0);
  if(round==="Kız Almaz") return 4-totalQ;
  if(round==="Erkek Almaz") return 8-totalM;
  if(round==="Kupa Almaz") return 13-totalH;
  if(round==="Rıfkı") return 1-totalR;
  return null;
}
function earlyEndReached(ns: Stats[], round: RoundType){
  if(round==="Kız Almaz") return ns.reduce((a,s)=>a+s.queens,0)>=4;
  if(round==="Erkek Almaz") return ns.reduce((a,s)=>a+s.male,0)>=8;
  if(round==="Kupa Almaz") return ns.reduce((a,s)=>a+s.hearts,0)>=13;
  if(round==="Rıfkı") return ns.reduce((a,s)=>a+s.rifki,0)>=1;
  return false;
}
function leadSuitRisk(handAfter: CardT[], suit: Suit, round: RoundType){
  const inSuit = handAfter.filter(c=>c.suit===suit);
  if(!inSuit.length) return 999;
  const high = inSuit.filter(c=>c.value>=11).length;
  const pen = inSuit.filter(c=>isPenaltyCard(c, round)).length;
  const top = Math.max(...inSuit.map(c=>c.value));
  return high*14 + pen*26 + Math.max(0, top-10)*2 + inSuit.length*1.5;
}
function safestLeadRisk(handAfter: CardT[], round: RoundType){
  const suits = Array.from(new Set(handAfter.map(c=>c.suit)));
  if(!suits.length) return 0;
  return Math.min(...suits.map(s=>leadSuitRisk(handAfter, s, round)));
}
function chooseBot(hand: CardT[], trick: {player:number; card:CardT}[], round: RoundType, trickNo: number, heartsBroken: boolean, trumpBroken: boolean, playedCards: CardT[] = [], isCommittedOpener = false){
  const trump = trumpOf(round);
  const lead = trick.length ? trick[0].card.suit : null;
  const legal = legalCards(hand, lead, round, heartsBroken, trumpBroken, trick, isCommittedOpener);
  const sorted = [...legal].sort((a,b)=>a.value-b.value);
  const isKoz = !!trump;
  const isPenaltyRound = round==="Kız Almaz"||round==="Erkek Almaz"||round==="Kupa Almaz"||round==="Rıfkı"||round==="El Almaz";
  const playedIds = new Set(playedCards.map(c=>c.id));
  const played = playedCards;
  const isHighestRemaining = (c: CardT)=> RANKS.every(r=> VALUES[r] <= c.value || played.some(x=>x.suit===c.suit && x.rank===r));
  const unseenPenaltyInSuit = (suit: Suit)=> {
    const all: CardT[] = [];
    SUITS.forEach(s=>RANKS.forEach(r=>all.push({suit:s,rank:r,value:VALUES[r],id:`${s}-${r}`})));
    return all.filter(c=>c.suit===suit && isPenaltyCard(c, round) && !hand.some(h=>h.id===c.id) && !playedIds.has(c.id)).length;
  };
  const unseenPenaltyTotal = SUITS.reduce((a,s)=>a+unseenPenaltyInSuit(s),0);
  const isSoleEscape = (c: CardT)=> c.value<=6 && hand.filter(h=>h.suit===c.suit && h.value<=6).length===1;
  const handSortedLow = [...hand].sort((a,b)=>a.value-b.value);
  const reservedIds = new Set(handSortedLow.slice(0,2).map(c=>c.id));
  if(!trick.length){
    if(round==="Son İki Almaz"){
      if(trickNo>=12) return sorted[0];
      const pool = trickNo>=8 ? sorted.filter(c=>!reservedIds.has(c.id)) : sorted;
      const candidates = pool.length ? pool : sorted;
      if(trickNo>=11){
        const low = candidates.filter(c=>c.value<=8);
        if(low.length) return low[0];
        return candidates[0];
      }
      if(trickNo>=8){
        const mid = candidates.filter(c=>c.value>=7 && c.value<=11);
        if(mid.length) return mid[0];
        return candidates[0];
      }
      return sorted[0];
    }
    if(isKoz){
      const trumpCards = sorted.filter(c=>c.suit===trump);
      const side = sorted.filter(c=>c.suit!==trump);
      const trumpInHand = hand.filter(c=>c.suit===trump);
      const strongTrump = trumpInHand.filter(c=>c.value>=12).length;
      const trumpPlayed = played.filter(c=>c.suit===trump).length;
      const trumpRemaining = Math.max(0, 13 - trumpPlayed - trumpInHand.length);
      const hasStrongTrump = strongTrump>=2 || (strongTrump>=1 && trumpInHand.length>=4);
      if(!side.length){
        if(trumpBroken){
          const committedOnly = isCommittedOpener ? committedTrumpCard(hand, trump) : null;
          return committedOnly || trumpCards[0] || sorted[0];
        }
        const requiredOnly = requiredTrumpLead(hand, trump);
        return requiredOnly || trumpCards[0] || sorted[0];
      }
      if(hasStrongTrump && trumpCards.length){
        if(trumpBroken){
          // After trump is broken: only the A-opener is committed to
          // K then Q when they CHOOSE to lead trump. Others are free
          // to lead any trump.
          if(isCommittedOpener){
            const committed = committedTrumpCard(hand, trump);
            if(committed) return committed;
          }
          return trumpCards[0];
        }
        // Bot chose trump -> must follow A-K-Q order, and only if it
        // holds the full trio. No trio -> cannot lead trump before
        // it is broken, so lead a side suit instead (free choice).
        if(hasTopTrump(hand, trump)){
          const required = requiredTrumpLead(hand, trump);
          if(required) return required;
        }
        return side[0];
      }
      const safeHighSide = side.find(c=>isHighestRemaining(c) && c.value>=11 && trumpRemaining>0);
      if(safeHighSide && trickNo>=10) return safeHighSide;
      return side[0];
    }
    if(isPenaltyRound){
      if(round==="Rıfkı"){
        const k = sorted.find(c=>c.suit==="Kupa"&&c.rank==="K");
        if(k && !played.some(c=>c.suit==="Kupa"&&c.rank==="A")) return k;
      }
      let best: CardT | null = null;
      let bestScore = Infinity;
      for(const c of sorted){
        const after = hand.filter(x=>x.id!==c.id);
        const suitRisk = leadSuitRisk(after, c.suit, round);
        const unseenDanger = unseenPenaltyInSuit(c.suit) * 9;
        const escapeCost = isSoleEscape(c) && trickNo<=9 ? 22 : 0;
        const penBonus = isPenaltyCard(c, round) ? -28 : 0;
        const score = suitRisk*0.55 + c.value*0.85 + penBonus + unseenDanger + escapeCost;
        if(score < bestScore){ bestScore = score; best = c; }
      }
      if(best) return best;
      return sorted[0];
    }
    return sorted[0];
  }
  const winnerPlayer = trickWinner(trick, lead!, trump);
  const currentWinCard = trick.find(t=>t.player===winnerPlayer)!.card;
  const isLastToPlay = trick.length===3;
  if(round==="Son İki Almaz"){
    if(trickNo>=12){
      const safe = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
      if(safe.length) return safe[0];
      return sorted[0];
    }
    if(trickNo>=8){
      const safe = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
      const safeNonReserved = safe.filter(c=>!reservedIds.has(c.id));
      if(safeNonReserved.length){
        if(trickNo>=11){
          const lowSafe = safeNonReserved.filter(c=>c.value<=8);
          if(lowSafe.length) return lowSafe[0];
        }
        if(trickNo>=10){
          const nonLow = safeNonReserved.filter(c=>c.value>6);
          if(nonLow.length) return nonLow[0];
        }
        return safeNonReserved[0];
      }
      if(safe.length) return safe[0];
      const winning = sorted.filter(c=>beats(c, currentWinCard, lead!, trump));
      const winNonReserved = winning.filter(c=>!reservedIds.has(c.id));
      return winNonReserved.length ? winNonReserved[0] : sorted[0];
    }
    const safeEarly = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
    return safeEarly.length ? safeEarly[0] : sorted[0];
  }
  if(isKoz){
    const winning = sorted.filter(c=>beats(c, currentWinCard, lead!, trump)).sort((a,b)=>a.value-b.value);
    const currentIsTrump = trump && currentWinCard.suit===trump;
    const trumpInHand = hand.filter(c=>c.suit===trump);
    const trumpPlayed = played.filter(c=>c.suit===trump).length;
    const trumpRemaining = Math.max(0, 13 - trumpPlayed - trumpInHand.length);
    const losing = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
    const losingNonTrump = losing.filter(c=>c.suit!==trump);
    const losingTrump = losing.filter(c=>c.suit===trump).sort((a,b)=>a.value-b.value);
    if(!winning.length){
      if(losingNonTrump.length) return losingNonTrump[0];
      if(losingTrump.length) return losingTrump[0];
      return sorted[0];
    }
    const cheapestWin = winning[0];
    if(cheapestWin.suit===trump && cheapestWin.value>=13 && trickNo<=9 && trumpRemaining>=3 && losingNonTrump.length){
      return losingNonTrump[0];
    }
    if(currentIsTrump){
      if(losingNonTrump.length && cheapestWin.value>=13) return losingNonTrump[0];
      return cheapestWin;
    }
    const nonTrumpWin = winning.filter(c=>c.suit!==trump);
    if(nonTrumpWin.length && lead!==trump){
      const safeHigh = nonTrumpWin.find(c=>isHighestRemaining(c));
      return safeHigh || nonTrumpWin[0];
    }
    const trumpWin = winning.filter(c=>c.suit===trump);
    if(trumpWin.length) return trumpWin[0];
    return winning[0];
  }
  if(isPenaltyRound){
    const safe = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
    if(round==="Rıfkı"){
      // CASE B — bot elinde Rıfkı tutuyor ve açılan renkten yoksa muaf:
      // Rıfkı'yı korumak için güvenli bir yan renk atmayı tercih et.
      // Yan renk yoksa Rıfkı dışındaki en düşük kupayı, o da yoksa Rıfkı'yı at.
      // CASE A (Rıfkı yok) zaten legalCards ile yalnızca kupayla sınırlı.
      const holdsRifkiBot = hand.some(c=>c.suit==="Kupa" && c.rank==="K");
      const voidLeadBot = !hand.some(c=>c.suit===lead);
      if(lead!=="Kupa" && voidLeadBot && holdsRifkiBot){
        const sideDiscard = sorted.filter(c=>c.suit!=="Kupa");
        if(sideDiscard.length) return sideDiscard[0];
        const nonRifkiHearts = sorted.filter(c=>!(c.suit==="Kupa" && c.rank==="K"));
        if(nonRifkiHearts.length) return nonRifkiHearts[0];
      }
      const k = sorted.find(c=>c.suit==="Kupa"&&c.rank==="K");
      if(k && !beats(k, currentWinCard, lead!, trump) && (isLastToPlay || currentWinCard.suit==="Kupa" && currentWinCard.rank==="A")) return k;
      const safeNonK = safe.filter(c=>!(c.suit==="Kupa"&&c.rank==="K"));
      if(safeNonK.length){
        const dump = safeNonK.filter(c=>penaltyValue(c, round)>0).sort((a,b)=>penaltyValue(b, round)-penaltyValue(a, round))[0];
        if(dump) return dump;
        return safeNonK[0];
      }
      if(k) return k;
    } else {
      const safeDump = safe.filter(c=>penaltyValue(c, round)>0).sort((a,b)=>penaltyValue(b, round)-penaltyValue(a, round))[0];
      if(safeDump) return safeDump;
    }
    let best: CardT | null = null;
    let bestScore = Infinity;
    for(const c of sorted){
      const wouldWin = beats(c, currentWinCard, lead!, trump);
      const trickCards = [...trick.map(t=>t.card), c];
      const trickPenalty = trickCards.reduce((a,card)=>a+penaltyValue(card, round),0);
      const myPenalty = penaltyValue(c, round);
      const after = hand.filter(x=>x.id!==c.id);
      const takePenalty = wouldWin ? trickPenalty * (isLastToPlay ? 1 : 0.65) : 0;
      const futureRisk = wouldWin ? safestLeadRisk(after, round)*0.55 : 0;
      const futureUnseen = wouldWin ? unseenPenaltyTotal * 2.5 : 0;
      const escapeCost = (!wouldWin && isSoleEscape(c) && trickNo<=10) ? 10 : 0;
      const discardBonus = (!wouldWin && myPenalty>0) ? -myPenalty*0.9 : 0;
      const elAlmazExtra = round==="El Almaz" && wouldWin ? 50 : 0;
      const score = takePenalty + futureRisk + futureUnseen + discardBonus + elAlmazExtra + escapeCost + c.value*0.12;
      if(score < bestScore){ bestScore = score; best = c; }
    }
    if(best) return best;
    return safe.length ? safe[0] : sorted[0];
  }
  const safe = sorted.filter(c=>!beats(c, currentWinCard, lead!, trump));
  return safe.length ? safe[0] : sorted[0];
}

function faceTint(card: CardT){
  if(card.rank==="J"||card.rank==="Q"||card.rank==="K") return "bg-white border border-[#CBD5E1]";
  return "";
}
function isFace(card: CardT){ return card.rank==="J"||card.rank==="Q"||card.rank==="K"; }
/* PREMIUM PLAYING CARD — ivory paper, gold inner frame, vector-style suit, ornate face cards */
function RealCard({card, className="", cornerSize="text-[13px]", centreSize="text-[28px]", suitSize="text-[11px]", showOrnament=true}:{card:CardT; className?:string; cornerSize?:string; centreSize?:string; suitSize?:string; showOrnament?:boolean}){
  const red = isRed(card.suit);
  const face = isFace(card);
  const ribbon = card.rank==="J" ? "bg-[#2563EB] text-white" : card.rank==="Q" ? "bg-[#7C3AED] text-white" : "bg-[#B45309] text-white";
  return (
    <div className={`card-face relative ${red?"card-red":"card-black"} ${className}`} aria-label={`${card.rank} ${card.suit}`}>
      {/* Thin inner gold line frame */}
      <span className="absolute inset-[3px] rounded-[5px] border border-[#D4AF37]/70 pointer-events-none" aria-hidden />
      {/* Top-left corner: rank + small suit */}
      <span className={`absolute top-[4px] left-[5px] flex flex-col items-center leading-none font-extrabold ${cornerSize}`}>
        <span className="card-rank">{card.rank}</span>
        <span className={`card-corner-suit ${suitSize} leading-none mt-[1px]`}>{suitSymbol(card.suit)}</span>
      </span>
      {/* Bottom-right corner, mirrored 180° */}
      <span className={`absolute bottom-[4px] right-[5px] flex flex-col items-center leading-none font-extrabold rotate-180 ${cornerSize}`}>
        <span className="card-rank">{card.rank}</span>
        <span className={`card-corner-suit ${suitSize} leading-none mt-[1px]`}>{suitSymbol(card.suit)}</span>
      </span>
      {/* Centre: large suit with gradient + gloss, ornate medallion for J/Q/K */}
      <span className="absolute inset-0 grid place-items-center">
        <span className={`flex flex-col items-center justify-center leading-none ${face && showOrnament ? "face-medallion w-[80%] aspect-square rounded-full" : "rounded-full"}`}>
          <span className={`suit-gloss ${face && showOrnament ? "" : ""}`}>
            <span className={`suit-glyph ${red?"suit-glyph-red":"suit-glyph-black"} ${centreSize}`}>{suitSymbol(card.suit)}</span>
          </span>
          {face && showOrnament && <span className={`face-ribbon mt-[2px] rounded-full px-[5px] py-[1px] text-[8px] font-black tracking-widest leading-none` + ` ${ribbon}`}>♛ {card.rank}</span>}
          {face && !showOrnament && <span className="text-[9px] font-black tracking-widest leading-none mt-[1px]">♛ {card.rank}</span>}
          {card.rank==="A" && <span className="text-[8px] font-black tracking-widest leading-none mt-[1px]">A</span>}
          {face && showOrnament && <span className="mt-[1px] flex gap-[1px] leading-none" aria-hidden><span className="w-[10px] h-[1px] bg-[#B48A1E] inline-block" /><span className="w-[10px] h-[1px] bg-[#B48A1E] inline-block" /></span>}
        </span>
      </span>
    </div>
  );
}
function CardBack({className="", label="♛", compact=false}:{className?:string; label?:string; compact?:boolean}){
  return (
    <div className={`card-back relative grid place-items-center overflow-hidden ${className}`} aria-label="Kapalı kart">
      <span className="absolute inset-[3px] rounded-[5px] border border-[#E9B949]/90 pointer-events-none" aria-hidden />
      <span className="absolute inset-[6px] rounded-[4px] border border-white/25 pointer-events-none" aria-hidden />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[72%] aspect-square rotate-45 border border-[#E9B949]/50 rounded-[3px] pointer-events-none" aria-hidden />
      {compact ? (
        <span className="card-back-emblem relative text-[9px] leading-none">♛</span>
      ) : (
        <span className="relative flex flex-col items-center leading-none">
          <span className="card-back-emblem text-[17px] leading-none">♛</span>
          <span className="text-[7px] font-black tracking-widest mt-[1px] text-[#FFE9A8]" style={{textShadow:"0 1px 2px rgba(0,0,0,.7)"}}>♦ KING ♦</span>
          <span className="text-[8px] leading-none mt-[1px] text-[#FFE9A8]">◆</span>
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
function MiniCard({card, small=false}:{card:CardT; small?:boolean}){
  void small;
  /* Center played cards use EXACTLY the same class, size and fonts as hand
     cards (hand-card): 70×100 (94×134 on sm+). No 1.3×/1.5× enlargement —
     the shared .hand-card CSS keeps every breakpoint in sync with the hand. */
  return <RealCard card={card} className="hand-card w-[70px] h-[100px] sm:w-[94px] sm:h-[134px]" cornerSize="text-[19px] sm:text-[22px]" centreSize="text-[32px] sm:text-[42px]" suitSize="text-[13px] sm:text-[14px]" />;
}
/* TAKEN / PENALTY PILE — redesigned, no more 15px mini badges.
   Every taken card is shown FACE-UP at exactly HALF the size of a normal
   card (35×50, 47×67 on sm+ — see .taken-card), with real red/black suit
   colours. Cards overlap by 50% so the top-left corner (rank + suit) of
   every card stays visible. orientation="row" wraps to a second row,
   orientation="column" wraps to a second column. The pile always sits
   BESIDE that player's own cards — never in the centre, never over the
   table trick. Penalty rounds show only penalty cards; trump rounds
   show every taken card, face-up. */
function TakenPile({ taken, round, orientation = "row" }: { taken: CardT[]; round: RoundType; orientation?: "row" | "column" }){
  if(!taken.length) return null;
  /* KOZ + EL ALMAZ — KESİN KURAL (kapalı yığın):
     Kazanılan her EL için tam olarak BİR kapalı kart çizilir — elin
     4 kartı için 4 ayrı CardBack YOK, açık kart YOK, sayı / rozet /
     "4" YOK, "kapalı" yazısı YOK.
     Test: taken.length = 8  -> Math.floor(8/4)  = 2 kapalı kart
           taken.length = 12 -> Math.floor(12/4) = 3 kapalı kart
           taken.length = 0  -> hiçbir şey (yukarıda return null)
     Kapalı kartlar yarım boy (.taken-card), ardışık kartlar %50
     YATAY bindirmeli: 1. el x=0, 2. el x=%50 (1. elin alt yarısı
     görünür), 3. el x=%100 (2. elin alt yarısı görünür)… Böylece
     3 el kazanıldıysa 3 kapalı kart görünür ve sayılabilir.
     Tüm eller aynı x'te üst üste ASLA bindirilmez. */
  const isClosedPile = !!trumpOf(round) || round === "El Almaz";
  if(isClosedPile){
    // KOZ + EL ALMAZ: kazanılan her el = tek kapalı kart, %50 yatay
    // bindirmeli. Üstünde YAZI YOK ("kapalı" etiketi kaldırıldı).
    const trickCount = Math.floor(taken.length / 4);
    if(!trickCount) return null;
    const label = `Kazanılan eller: ${trickCount}`;
    return (
      <div className="taken-pile pointer-events-none" aria-label={label} title={label}>
        <div className="flex taken-pile-row">
          {Array.from({ length: trickCount }).map((_, i) => (
            <span key={i} className="taken-card-wrap block shrink-0" style={{ zIndex: i }}>
              <CardBack className="taken-card" compact />
            </span>
          ))}
        </div>
      </div>
    );
  }
  /* DİĞER CEZA TURLARI — açık yığın, değişmedi: her ceza kartı
     yarım boy, açık, %50 bindirmeli. Bu dal Koz / El Almaz için
     asla çalışmaz (yukarıda erken return). */
  const penalty = isPenaltyRoundType(round);
  const shown = penalty ? penaltyCardsFor(taken, round) : taken;
  if(!shown.length) return null;
  // Bir satır/sütuna sığan kart sayısı: sığmazsa yeni satır/sütuna sar.
  const per = orientation === "row" ? 8 : 5;
  const chunks: CardT[][] = [];
  for(let i = 0; i < shown.length; i += per) chunks.push(shown.slice(i, i + per));
  const label = penalty ? `Ceza • ${shown.length}` : `Alınan • ${shown.length}`;
  const title = `${label}: ${shown.map((c) => `${c.rank}${suitSymbol(c.suit)}`).join(", ")}`;
  return (
    <div className="taken-pile pointer-events-none" title={title} aria-label={label}>
      <span className="taken-pile-label">{label}</span>
      <div className={orientation === "row" ? "flex flex-col gap-1" : "flex flex-row gap-1 items-start"}>
        {chunks.map((chunk, ci) => (
          <div key={ci} className={orientation === "row" ? "flex taken-pile-row" : "flex flex-col taken-pile-col"}>
            {chunk.map((c, i) => (
              <span key={`${c.id}-${ci}-${i}`} className="taken-card-wrap block shrink-0" style={{ zIndex: i }}>
                <RealCard card={c} className="taken-card" cornerSize="text-[11px]" centreSize="text-[18px]" suitSize="text-[8px]" showOrnament={false} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function evaluateHand(hand: CardT[]){
  const queens = hand.filter(c=>c.rank==="Q").length;
  const males = hand.filter(c=>c.rank==="J"||c.rank==="K").length;
  const hearts = hand.filter(c=>c.suit==="Kupa").length;
  const hasKingHearts = hand.some(c=>c.suit==="Kupa"&&c.rank==="K");
  const highCards = hand.filter(c=>c.value>=12).length;
  const lowCards = hand.filter(c=>c.value<=6).length;
  const trumpStrength = (suit: Suit)=>{
    const cards = hand.filter(c=>c.suit===suit);
    const top = cards.filter(c=>c.rank==="A"||c.rank==="K"||c.rank==="Q").map(c=>c.rank);
    const score = cards.reduce((a,c)=>a + (c.rank==="A"?5:c.rank==="K"?4:c.rank==="Q"?3:c.rank==="J"?2:c.value>=10?1:0),0);
    return { count: cards.length, top, score };
  };
  const suits = SUITS.map(s=>({ suit:s, ...trumpStrength(s) }));
  const best = [...suits].sort((a,b)=>b.score-a.score || b.count-a.count)[0];
  return { hand, queens, males, hearts, hasKingHearts, highCards, lowCards, suits, best };
}
function desirability(hand: CardT[], r: RoundType): number{
  const ev = evaluateHand(hand);
  if(r==="Kız Almaz") return 100 - ev.queens*34 - ev.highCards*2;
  if(r==="Erkek Almaz") return 100 - ev.males*24 - ev.highCards*1;
  if(r==="Kupa Almaz") return 100 - ev.hearts*12 - (ev.hearts>=5?18:0);
  if(r==="Rıfkı") return ev.hasKingHearts ? 2 : 92 - ev.hearts*5;
  if(r==="El Almaz") return 100 - ev.highCards*11 + ev.lowCards*5;
  if(r==="Son İki Almaz") return 58 + ev.lowCards*8 - ev.highCards*5;
  const suit = r==="Koz-Maça" ? "Maça" : r==="Koz-Kupa" ? "Kupa" : r==="Koz-Karo" ? "Karo" : "Sinek";
  const s = ev.suits.find(x=>x.suit===suit)!;
  return 18 + s.score*6 + s.count*4 + s.top.length*4;
}

/* ================= FRIENDS / MULTIPLAYER ================= */
type RoomPlayer = { name: string; seat: number; ready: boolean; isBot: boolean };
type FriendGameState = {
  phase: "select-round" | "playing" | "finished" | "match-finished";
  round: RoundType;
  hands: CardT[][];
  trick: { player: number; card: CardT }[];
  trickNo: number;
  current: number;
  stats: Stats[];
  takenCards: CardT[][];
  heartsBroken: boolean; trumpBroken: boolean;
  openedTrumpWithA: boolean[];
  roundsPlayed: number;
  baseTotals: number[];
  playedChoices: RoundType[][];
  penaltyCounts: Record<RoundType, number>;
  chooser: number;
  chooserOffset: number;
  lastWinner: string;
  lastRoundScores: number[] | null;
  lastRoundTaken: CardT[][] | null;
  roundHistory?: { round: RoundType; scores: number[]; chooser: number }[];
  /* SINGLE SOURCE OF TRUTH / DEDUP (race fix):
     moveId = unique id of the last applied move; collectedTrickIds =
     trickIds already collected locally. An echo / poll that carries a
     moveId already seen, or a trickId already collected, must be
     ignored — never replayed. */
  moveId?: string;
  collectedTrickIds?: string[];
  matchId?: string;
  startedAt?: number;
};
type RoomValue = { type: "room"; code: string; host: string; hostSeat: number; players: RoomPlayer[]; status: "lobby" | "playing"; gameState: FriendGameState | null; updatedAt: number };
const BOT_POOL = ["Bot Ege", "Bot Deniz", "Bot Ada", "Bot Lara"];
const EMPTY_PENALTY: Record<RoundType, number> = { "Kız Almaz": 0, "Erkek Almaz": 0, "Kupa Almaz": 0, "Rıfkı": 0, "El Almaz": 0, "Son İki Almaz": 0, "Koz-Maça": 0, "Koz-Kupa": 0, "Koz-Karo": 0, "Koz-Sinek": 0 };
function friendCountsFor(gs: FriendGameState, player: number){
  const list = gs.playedChoices[player] || [];
  const pen = list.filter(isPenaltyRoundType).length;
  const tru = list.filter((r) => !isPenaltyRoundType(r)).length;
  return { played: list.length, pen, tru, remPen: 3 - pen, remTru: 2 - tru };
}
function friendAvailableFor(gs: FriendGameState, player: number): RoundType[]{
  const list = gs.playedChoices[player] || [];
  const c = friendCountsFor(gs, player);
  const out: RoundType[] = [];
  PENALTY_ROUNDS.forEach((r) => { if (!list.includes(r) && c.remPen > 0 && (gs.penaltyCounts[r] ?? 0) < 2) out.push(r); });
  TRUMP_ROUNDS.forEach((r) => { if (c.remTru > 0) out.push(r); });
  return out;
}
function dealFriendGame(prev: FriendGameState | null): FriendGameState{
  const deck = makeDeck();
  const h: CardT[][] = [[], [], [], []];
  for (let i = 0; i < 52; i++) h[i % 4].push(deck[i]);
  const sinekHolder = h.findIndex((hand) => hand.some((c) => c.suit === "Sinek" && c.rank === "2"));
  const roundsPlayed = prev?.roundsPlayed ?? 0;
  const chooserOffset = prev ? prev.chooserOffset : (sinekHolder >= 0 ? sinekHolder : 0);
  const chooser = (roundsPlayed + chooserOffset) % 4;
  const matchId = prev?.matchId ?? `mac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = prev?.startedAt ?? Date.now();
  return {
    matchId, startedAt,
    phase: "select-round", round: "Kız Almaz",
    hands: h.map((hand, idx) => idx === 0 ? sortHumanHand(hand) : sortHand(hand)),
    trick: [], trickNo: 1, current: -1,
    stats: [emptyStats(), emptyStats(), emptyStats(), emptyStats()],
    takenCards: [[], [], [], []],
    heartsBroken: false, trumpBroken: false, openedTrumpWithA: [false, false, false, false],
    roundsPlayed, baseTotals: prev?.baseTotals ?? [0, 0, 0, 0],
    playedChoices: prev?.playedChoices ?? [[], [], [], []],
    penaltyCounts: prev?.penaltyCounts ?? { ...EMPTY_PENALTY },
    chooser, chooserOffset, lastWinner: "", lastRoundScores: null, lastRoundTaken: null,
    moveId: "", collectedTrickIds: [],
    roundHistory: prev?.roundHistory ? [...prev.roundHistory] : [],
  };
}
/* ---- Race-fix helpers: moveId / trickId / dedup ---- */
function makeMoveId(tableCode: string, round: RoundType, trickNo: number, player: number, cardId: string, roundsPlayed = 0){
  return `${tableCode}|maç${roundsPlayed}|${round}|el${trickNo}|p${player}|${cardId}`;
}
function makeTrickId(round: RoundType, trickNo: number, trick: { player: number; card: CardT }[]){
  return `${round}|el${trickNo}|${trick.map((t) => `${t.player}:${t.card.id}`).join(",")}`;
}
/* No Realtime subscription exists in this build — polling is the only
   sync channel. realtimeActive stays false so polling and realtime can
   never run at the same time; if a realtime channel is ever added,
   polling must be disabled while it is active. */
const REALTIME_ACTIVE = false;
function copyTextViaField(text: string){
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", "");
  ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch { /* copy unavailable */ }
  document.body.removeChild(ta);
}
function FriendsTable({ room, mySeat, isHost, onSaveGame, onBackToLobby, onNewMatch, onLeave, onCloseTable }: { room: RoomValue; mySeat: number; isHost: boolean; onSaveGame: (gs: FriendGameState) => Promise<void>; onBackToLobby: () => Promise<void>; onNewMatch: () => Promise<void>; onLeave: () => void; onCloseTable?: () => Promise<void> | void }){
  const gs = room.gameState!;
  const { preset: speedPreset } = useGameSpeed();
  /* Son oynanan kart parlaması kaldırıldı: botun elinin üstüne binen
     küçük kart efektini önlemek için oynanan kartlar yalnızca masa
     ortasında, parlamasız gösterilir. */
  const myName = displayPlayerName(room.players.find((p) => p.seat === mySeat)?.name ?? "Sen", mySeat);
  const [selected, setSelected] = useState<RoundType | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [turnStartedAt, setTurnStartedAt] = useState(() => Date.now());
  const [, setStuckSecs] = useState(0);
  const [closingTable, setClosingTable] = useState(false);
  const [lastMoveId, setLastMoveId] = useState("");
  const [blockedInfo, setBlockedInfo] = useState<{ text: string; mustId: string | null; key: number } | null>(null);
  const [showScoreboard, setShowScoreboard] = useState(false);
  /* Watchdog attempts are THROTTLED, never permanently locked: a failed
     attempt must be retried ~1s later, otherwise one failed heal leaves
     the game stuck forever (that was the left-bot stall). */
  const watchdogAttemptRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  /* Race-fix refs (never rendered state that re-triggers effects):
     appliedMoveIds = every moveId already applied locally (optimistic +
     echo + poll all share it, so a duplicate arrival is a no-op);
     inFlightMoveIds = moves currently syncing, so a second trigger
     (bot timer + watchdog) cannot replay the same card;
     processingTrickRef = isProcessingTrick lock — while a trick is
     being collected no new move / bot trigger is accepted;
     collectedTrickIdsRef = trickIds already collected locally — a
     stale echo saying the cards are still on the table is ignored. */
  const appliedMoveIdsRef = useRef<Set<string>>(new Set());
  const inFlightMoveIdsRef = useRef<Set<string>>(new Set());
  const processingTrickRef = useRef(false);
  const [, setProcessingTrick] = useState(false);
  const collectedTrickIdsRef = useRef<Set<string>>(new Set());
  const resolveRef = useRef("");
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chooser = gs.chooser;
  const chooserName = displayPlayerName(room.players.find((p) => p.seat === chooser)?.name ?? NAMES[chooser], chooser);
  const chooserAvail = friendAvailableFor(gs, chooser);
  const estimated = useMemo(() => gs.stats.map((s) => scoreFor(s, gs.round)), [gs.stats, gs.round]);
  const leadSuit = gs.trick.length ? gs.trick[0].card.suit : null;
  const playableIds = useMemo(() => {
    if (gs.phase !== "playing" || gs.current !== mySeat) return new Set<string>();
    return new Set(legalCards(gs.hands[mySeat] || [], leadSuit, gs.round, gs.heartsBroken, gs.trumpBroken, gs.trick, gs.openedTrumpWithA[mySeat]).map((c) => c.id));
  }, [gs, mySeat, leadSuit]);
  const isKoz = !!trumpOf(gs.round);
  const seqCard = (() => {
    if (gs.phase !== "playing" || gs.current !== mySeat || gs.trick.length !== 0 || !isKoz || gs.trumpBroken) return null;
    const trump = trumpOf(gs.round); if (!trump) return null;
    const hand0 = gs.hands[mySeat] || [];
    // Also shown when the hand is only trump: As is still the required
    // lead, so "Papaz under As" stays explained instead of silent.
    if (!hasTopTrump(hand0, trump)) return null;
    return requiredTrumpLead(hand0, trump);
  })();
  const committedCard = (() => {
    if (gs.phase !== "playing" || gs.current !== mySeat || gs.trick.length !== 0 || !isKoz || !gs.trumpBroken || !gs.openedTrumpWithA[mySeat]) return null;
    const trump = trumpOf(gs.round); if (!trump) return null;
    return committedTrumpCard(gs.hands[mySeat] || [], trump);
  })();
  const mustHint = useMemo(() => {
    if (gs.phase !== "playing" || gs.current !== mySeat || !gs.trick.length) return "";
    const hand = gs.hands[mySeat] || [];
    const lead = gs.trick[0].card.suit;
    if (gs.round === "Kupa Almaz") {
      if (lead !== "Kupa" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.suit === "Kupa")) return "Elinde açılan renk yok ve elinde kupa var — kupa atmak zorundasın!";
      return "";
    }
    if (gs.round === "Rıfkı") {
      if (lead !== "Kupa" && !hand.some((c) => c.suit === lead) && hand.some((c) => c.suit === "Kupa")) {
        if (hand.some((c) => c.suit === "Kupa" && c.rank === "K")) return "Elinde Rıfkı var — Rıfkı'yı korumak için istediğin kartı atabilirsin.";
        return "Elinde açılan renk yok, elinde Rıfkı yok ve elinde kupa var — kupa atmak zorundasın!";
      }
      return "";
    }
    if (gs.round === "Erkek Almaz") {
      if (!hand.some((c) => c.suit === lead) && hand.some((c) => c.rank === "J" || c.rank === "K")) return "Elinde açılan renk yok ve elinde erkek var — erkek atmak zorundasın!";
      return "";
    }
    if (gs.round === "Kız Almaz") {
      if (!hand.some((c) => c.suit === lead) && hand.some((c) => c.rank === "Q")) return "Elinde açılan renk yok ve elinde kız var — kız atmak zorundasın!";
      return "";
    }
    const trump = trumpOf(gs.round); if (!trump) return "";
    const hasLead = hand.some((c) => c.suit === lead);
    const trumpCards = hand.filter((c) => c.suit === trump);
    const playedTrumps = gs.trick.filter((t) => t.card.suit === trump);
    if (lead === trump) {
      if (!hasLead) return "";
      if (playedTrumps.length) { const mx = Math.max(...playedTrumps.map((t) => t.card.value)); if (hand.some((c) => c.suit === trump && c.value > mx)) return "Masada koz var ve elinde daha büyük koz var — büyüğünü atmak zorundasın!"; }
      return "";
    }
    if (hasLead) return "";
    if (!trumpCards.length) return "";
    if (playedTrumps.length) { const mx = Math.max(...playedTrumps.map((t) => t.card.value)); if (trumpCards.some((c) => c.value > mx)) return "Masada koz var ve elinde daha büyük koz var — büyüğünü atmak zorundasın!"; }
    return "Elinde açılan renk yok — koz atmak zorundasın!";
  }, [gs, mySeat]);
  const relOf = (seat: number) => (seat - mySeat + 4) % 4;
  const posForRel = (rel: number) => rel === 0 ? "bottom" : rel === 1 ? "left" : rel === 2 ? "top" : "right";
  async function applyPlay(player: number, card: CardT){
    if (gs.phase !== "playing" || gs.current !== player) return;
    // isProcessingTrick lock: while a trick is being collected, no new move.
    if (processingTrickRef.current) return;
    // DEDUP: same moveId from optimistic + echo + poll / bot timer +
    // watchdog must never replay. The card is already gone from the hand
    // after the first application, so a replay would be a second card.
    const moveId = makeMoveId(room.code, gs.round, gs.trickNo, player, card.id, gs.roundsPlayed);
    if (appliedMoveIdsRef.current.has(moveId) || inFlightMoveIdsRef.current.has(moveId)) return;
    if (gs.moveId && gs.moveId === moveId) return;
    setLastMoveId(moveId);
    /* Legality is checked BEFORE the move is marked applied: an early
       return must never poison this card for the rest of the trick. */
    if (gs.trick.length > 0) { const legal = legalCards(gs.hands[player], leadSuit, gs.round, gs.heartsBroken, gs.trumpBroken, gs.trick); if (!legal.some((c) => c.id === card.id)) return; }
    if (!gs.trick.length) { const legal = legalCards(gs.hands[player], null, gs.round, gs.heartsBroken, gs.trumpBroken, gs.trick, gs.openedTrumpWithA[player]); if (!legal.some((c) => c.id === card.id)) return; }
    if (!gs.trick.length && (gs.round === "Kupa Almaz" || gs.round === "Rıfkı") && !gs.heartsBroken && card.suit === "Kupa" && gs.hands[player].some((c) => c.suit !== "Kupa")) return;
    appliedMoveIdsRef.current.add(moveId);
    inFlightMoveIdsRef.current.add(moveId);
    if (!gs.trick.length) {
      const trump = trumpOf(gs.round);
      if (trump && !gs.trumpBroken && card.suit === trump) {
        const onlyTrump = gs.hands[player].length > 0 && gs.hands[player].every((c) => c.suit === trump);
        const required = requiredTrumpLead(gs.hands[player], trump);
        const blocked = onlyTrump ? !!(required && required.id !== card.id) : (!hasTopTrump(gs.hands[player], trump) || !required || required.id !== card.id);
        if (blocked) { inFlightMoveIdsRef.current.delete(moveId); appliedMoveIdsRef.current.delete(moveId); return; }
      }
    }
    const onlyHearts = gs.hands[player].length > 0 && gs.hands[player].every((c) => c.suit === "Kupa");
    let heartsBroken = gs.heartsBroken;
    const breaksHearts = card.suit === "Kupa" && ((gs.trick.length === 0 && onlyHearts) || (gs.trick.length > 0 && leadSuit !== "Kupa"));
    if (breaksHearts && !heartsBroken && (gs.round === "Kupa Almaz" || gs.round === "Rıfkı")) heartsBroken = true;
    const trumpNow = trumpOf(gs.round);
    let trumpBroken = gs.trumpBroken;
    const breaksTrump = !!trumpNow && card.suit === trumpNow && (gs.trick.length === 0 || (gs.trick.length > 0 && leadSuit !== trumpNow));
    if (breaksTrump && !trumpBroken) trumpBroken = true;
    const opened = [...gs.openedTrumpWithA];
    if (!gs.trick.length && trumpNow && !gs.trumpBroken && card.suit === trumpNow && card.rank === "A") opened[player] = true;
    const hands = gs.hands.map((h, i) => i === player ? h.filter((c) => c.id !== card.id) : h);
    const trick = [...gs.trick, { player, card }];
    const next: FriendGameState = { ...gs, hands, trick, heartsBroken, trumpBroken, openedTrumpWithA: opened, current: trick.length < 4 ? (player + 1) % 4 : -1, moveId, collectedTrickIds: gs.collectedTrickIds ?? [] };
    setSaving(true);
    try { await onSaveGame(next); } finally { setSaving(false); inFlightMoveIdsRef.current.delete(moveId); }
  }
  async function selectRound(r: RoundType){
    if (gs.phase !== "select-round" || mySeat !== chooser) return;
    if (!chooserAvail.includes(r)) return;
    const penaltyCounts = { ...gs.penaltyCounts };
    if (PENALTY_ROUNDS.includes(r)) penaltyCounts[r] = Math.min(2, (penaltyCounts[r] ?? 0) + 1);
    setSaving(true);
    try { await onSaveGame({ ...gs, round: r, phase: "playing", current: chooser, penaltyCounts }); setSelected(null); } finally { setSaving(false); }
  }
  useEffect(() => { if (!blockedInfo) return; const t = setTimeout(() => setBlockedInfo(null), 4000); return () => clearTimeout(t); }, [blockedInfo]);
  function handleMyCardClick(card: CardT){
    console.log("[card-click]", card.id, card.suit, card.rank, "playable:", playableIds.has(card.id), "lead:", gs.trick.length ? gs.trick[0].card.suit : null, "trump:", trumpOf(gs.round));
    if (gs.phase !== "playing" || gs.current !== mySeat) return;
    if (playableIds.has(card.id)) { void applyPlay(mySeat, card); return; }
    const explained = explainBlockedCard(gs.hands[mySeat] || [], gs.trick, gs.round, gs.heartsBroken, gs.trumpBroken, gs.openedTrumpWithA[mySeat], card);
    setBlockedInfo({ text: explained?.reason ?? "Bu kart bu elde oynanamaz.", mustId: explained?.mustCard?.id ?? null, key: Date.now() });
  }
  function blockedReasonFor(card: CardT){
    if (gs.phase !== "playing" || gs.current !== mySeat || playableIds.has(card.id)) return "";
    return explainBlockedCard(gs.hands[mySeat] || [], gs.trick, gs.round, gs.heartsBroken, gs.trumpBroken, gs.openedTrumpWithA[mySeat], card)?.reason ?? "";
  }
  useEffect(() => {
    if (gs.phase !== "playing") return;
    // HOST-ONLY BOT: only the table host decides bot moves. Every other
    // client just receives the host's move — two clients deciding the
    // same bot turn was the duplicate-bot-card bug.
    // NO seat-specific logic: seat 0/1/2/3 (left, top, right) are all
    // handled by this same effect. The old botTurnKeyRef permanently
    // marked a turn as "handled" before its timer fired, so if the
    // timer was cleared by a re-render the bot never played again —
    // that was the stall. Now the timer is simply rescheduled on
    // every re-render; applyPlay dedups by moveId if it ever fires twice.
    if (!isHost) return;
    if (processingTrickRef.current) return;
    const curPlayer = room.players.find((p) => p.seat === gs.current);
    if (!curPlayer?.isBot || gs.trick.length >= 4) return;
    if (gs.trick.some((t) => t.player === gs.current)) return;
    if (botTimer.current) clearTimeout(botTimer.current);
    // Bot waits the full readable pace (Normal 900ms) so the turn
    // indicator stays visible for at least 600ms before it plays.
    // The move is computed locally with legalCards (chooseBot) and shown
    // instantly via the optimistic onSaveGame; a failed sync never blocks
    // the next turn because the optimistic state already advanced.
    botTimer.current = setTimeout(() => {
      const hand = gs.hands[gs.current] || [];
      if (!hand.length) return;
      const played = [...gs.takenCards.flat(), ...gs.trick.map((t) => t.card)];
      const c = chooseBot(hand, gs.trick, gs.round, gs.trickNo, gs.heartsBroken, gs.trumpBroken, played, gs.openedTrumpWithA[gs.current]);
      if (c) applyPlay(gs.current, c).catch(() => { /* sync failure: optimistic state already showed the move */ });
    }, speedPreset.bot);
    return () => { if (botTimer.current) clearTimeout(botTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase, gs.current, gs.trick, gs.hands, gs.round, isHost]);
  // --- BOT WATCHDOG: never wait indefinitely ---
  // Track when the current turn started so we can measure stuck time.
  useEffect(() => { setTurnStartedAt(Date.now()); setStuckSecs(0); watchdogAttemptRef.current = { key: "", at: 0 }; }, [gs.phase, gs.current, gs.trick.length, gs.trickNo, gs.chooser, gs.round]);
  useEffect(() => {
    if (gs.phase !== "playing" && gs.phase !== "select-round") return;
    // No manual resume button: the game must never get stuck, so
    // this invisible host-only watchdog is the self-healing path. It runs
    // automatically, never asks the player to press anything, and never
    // replays a move (applyPlay dedups by moveId).
    // Covers EVERY seat (0/1/2/3) with the same code — there is no
    // seat-specific branch, so the left bot gets the same heal as the
    // right/top bot. After 2s without a move it auto-plays locally.
    if (!isHost) return;
    const iv = setInterval(() => {
      if (REALTIME_ACTIVE) return;
      if (processingTrickRef.current) return;
      const elapsed = Date.now() - turnStartedAt;
      setStuckSecs(Math.floor(elapsed / 1000));
      if (elapsed < 2000) return;
      // SELECT-ROUND: bot chooser never picks -> pick for it; empty chooser seat -> skip it.
      if (gs.phase === "select-round") {
        const chooserPlayer = room.players.find((p) => p.seat === gs.chooser);
        const key = `select-${gs.roundsPlayed}-${gs.chooser}-${gs.chooserOffset}`;
        if (watchdogAttemptRef.current.key === key && Date.now() - watchdogAttemptRef.current.at < 1000) return;
        watchdogAttemptRef.current = { key, at: Date.now() };
        if (!chooserPlayer) { onSaveGame({ ...gs, chooserOffset: gs.chooserOffset + 1, chooser: (gs.roundsPlayed + gs.chooserOffset + 1) % 4 }).catch(() => {}); return; }
        if (chooserPlayer.isBot) {
          const avail = friendAvailableFor(gs, gs.chooser);
          if (!avail.length) { onSaveGame({ ...gs, chooserOffset: gs.chooserOffset + 1, chooser: (gs.roundsPlayed + gs.chooserOffset + 1) % 4 }).catch(() => {}); return; }
          const hand = gs.hands[gs.chooser] || [];
          let best = avail[0]; let bestScore = -Infinity;
          avail.forEach((r) => { const s = desirability(hand, r); if (s > bestScore) { bestScore = s; best = r; } });
          const pc = { ...gs.penaltyCounts }; if (PENALTY_ROUNDS.includes(best)) pc[best] = Math.min(2, (pc[best] ?? 0) + 1);
          onSaveGame({ ...gs, round: best, phase: "playing", current: gs.chooser, penaltyCounts: pc }).catch(() => {});
        }
        return;
      }
      // PLAYING: empty seat -> skip; bot turn -> force a legal card locally (sync happens in background via onSaveGame).
      if (gs.phase !== "playing" || gs.current < 0 || gs.trick.length >= 4) return;
      const key = `play-${gs.round}-${gs.trickNo}-${gs.current}-${gs.trick.map((t) => t.card.id).join(",")}`;
      if (watchdogAttemptRef.current.key === key && Date.now() - watchdogAttemptRef.current.at < 1000) return;
      watchdogAttemptRef.current = { key, at: Date.now() };
      const curPlayer = room.players.find((p) => p.seat === gs.current);
      if (!curPlayer) { onSaveGame({ ...gs, current: (gs.current + 1) % 4 }).catch(() => {}); return; }
      if (!curPlayer.isBot) return;
      // Bot already played into this trick (stale turn pointer) -> skip him.
      if (gs.trick.some((t) => t.player === gs.current)) { onSaveGame({ ...gs, current: (gs.current + 1) % 4 }).catch(() => {}); return; }
      const hand = gs.hands[gs.current] || [];
      // Sync bug: bot's hand arrived empty but the turn is his -> skip him
      // instead of waiting forever. He holds no card to play.
      if (!hand.length) { onSaveGame({ ...gs, current: (gs.current + 1) % 4 }).catch(() => {}); return; }
      const played = [...gs.takenCards.flat(), ...gs.trick.map((t) => t.card)];
      const c = chooseBot(hand, gs.trick, gs.round, gs.trickNo, gs.heartsBroken, gs.trumpBroken, played, gs.openedTrumpWithA[gs.current]);
      if (!c) { onSaveGame({ ...gs, current: (gs.current + 1) % 4 }).catch(() => {}); return; }
      // applyPlay is async and syncs in background; even if the sync fails the
      // optimistic update in the caller already showed the move locally.
      // A failed attempt is NOT permanently locked: the throttle above
      // lets this same turn be retried ~1s later.
      applyPlay(gs.current, c).catch(() => {});
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, room.players, isHost, turnStartedAt]);
  /* No forceAdvance / manual resume button: the game must not
     get stuck in the first place. The host-only bot effect, the
     host-only trick-resolution effect and the host-only watchdog above
     advance the game automatically; a manual resume button would only
     risk replaying the last card. This comment replaces the removed
     manual function so no stale reference remains. */
  useEffect(() => {
    // Trick collection: HOST ONLY, with the isProcessingTrick lock.
    // The winner collects locally immediately (optimistic), then syncs —
    // it never waits for a server echo. A stale echo carrying a trickId
    // already collected is ignored via collectedTrickIdsRef.
    if (!isHost) return;
    if (gs.phase !== "playing" || gs.trick.length !== 4) return;
    const trickId = makeTrickId(gs.round, gs.trickNo, gs.trick);
    if (collectedTrickIdsRef.current.has(trickId) || (gs.collectedTrickIds ?? []).includes(trickId)) return;
    if (processingTrickRef.current) return;
    // Lock only while THIS collection timer is pending. Cleanup clears it
    // if a poll re-render cancels the timer, so a re-run can reschedule —
    // the collected set is only marked AFTER the save below, so a stale
    // echo of this same trick is ignored only after it really collected.
    processingTrickRef.current = true; setProcessingTrick(true);
    const key = `${gs.round}-${gs.trickNo}-${gs.trick.map((t) => t.card.id).join(",")}`;
    resolveRef.current = key;
    const collectedNext = [...(gs.collectedTrickIds ?? []), trickId];
    const t = setTimeout(async () => {
      const trump = trumpOf(gs.round);
      const winner = trickWinner(gs.trick, gs.trick[0].card.suit, trump);
      const ns = gs.stats.map((s) => ({ ...s }));
      ns[winner].tricks += 1;
      gs.trick.forEach(({ card }) => {
        if (card.rank === "Q") ns[winner].queens += 1;
        if (card.rank === "J" || card.rank === "K") ns[winner].male += 1;
        if (card.suit === "Kupa") ns[winner].hearts += 1;
        if (card.suit === "Kupa" && card.rank === "K") ns[winner].rifki += 1;
      });
      if (gs.trickNo === 12 || gs.trickNo === 13) ns[winner].sonIki += 1;
      const ntaken = gs.takenCards.map((a) => [...a]);
      ntaken[winner] = [...ntaken[winner], ...gs.trick.map((x) => x.card)];
      try {
        if (earlyEndReached(ns, gs.round)) {
          const scores = ns.map((s, i) => computeFinalRoundScore(s, ntaken[i] || [], gs.round));
          const played = gs.playedChoices.map((list, i) => i === chooser ? [...list, gs.round] : [...list]);
          await onSaveGame({ ...gs, stats: ns, takenCards: ntaken, trick: [], phase: "finished", lastWinner: room.players.find((p) => p.seat === winner)?.name ?? "", lastRoundScores: scores, lastRoundTaken: ntaken, baseTotals: gs.baseTotals.map((x, i) => x + scores[i]), roundsPlayed: gs.roundsPlayed + 1, playedChoices: played, current: -1, collectedTrickIds: collectedNext, roundHistory: [...(gs.roundHistory ?? []), { round: gs.round, scores, chooser }] });
          return;
        }
        if (gs.trickNo === 13) {
          const scores = ns.map((s, i) => computeFinalRoundScore(s, ntaken[i] || [], gs.round));
          const played = gs.playedChoices.map((list, i) => i === chooser ? [...list, gs.round] : [...list]);
          await onSaveGame({ ...gs, stats: ns, takenCards: ntaken, trick: [], phase: "finished", lastWinner: room.players.find((p) => p.seat === winner)?.name ?? "", lastRoundScores: scores, lastRoundTaken: ntaken, baseTotals: gs.baseTotals.map((x, i) => x + scores[i]), roundsPlayed: gs.roundsPlayed + 1, playedChoices: played, current: -1, collectedTrickIds: collectedNext, roundHistory: [...(gs.roundHistory ?? []), { round: gs.round, scores, chooser }] });
        } else {
          await onSaveGame({ ...gs, stats: ns, takenCards: ntaken, trick: [], trickNo: gs.trickNo + 1, current: winner, lastWinner: room.players.find((p) => p.seat === winner)?.name ?? "", collectedTrickIds: collectedNext });
        }
      } finally {
        collectedTrickIdsRef.current.add(trickId);
        processingTrickRef.current = false; setProcessingTrick(false);
      }
    }, speedPreset.collection);
    return () => { clearTimeout(t); processingTrickRef.current = false; setProcessingTrick(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.trick, gs.phase, isHost, speedPreset.collection]);
  useEffect(() => {
    if (gs.phase !== "finished") return;
    // HOST ONLY: a second client dealing the next round was a duplicate-deal
    // race. Non-hosts just receive the host's next round.
    if (!isHost) return;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(async () => {
      if (gs.roundsPlayed >= 20) { await onSaveGame({ ...gs, phase: "match-finished" }); }
      else { const next = dealFriendGame(gs); await onSaveGame(next); }
    }, speedPreset.collection);
    return () => { if (finishTimer.current) clearTimeout(finishTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase, isHost]);
  useEffect(() => {
    if (!isHost) return;
    if (gs.phase !== "select-round" || chooserAvail.length) return;
    const t = setTimeout(async () => { await onSaveGame({ ...gs, chooserOffset: gs.chooserOffset + 1, chooser: (gs.roundsPlayed + gs.chooserOffset + 1) % 4 }); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.phase, chooserAvail.length, isHost]);
  const myHand = useMemo(() => sortHumanHand(gs.hands[mySeat] || []), [gs.hands, mySeat]);
  const displayHand = myHand;
  const trickWinnerName = gs.trick.length === 4 ? displayPlayerName(room.players.find((p) => p.seat === trickWinner(gs.trick, gs.trick[0].card.suit, trumpOf(gs.round)))?.name ?? "", trickWinner(gs.trick, gs.trick[0].card.suit, trumpOf(gs.round))) : "";
  const finalOrder = [...room.players.map((p) => p.seat)].sort((a, b) => gs.baseTotals[b] - gs.baseTotals[a]);
  const roundInfo = ROUNDS.find((r) => r.name === gs.round)!;
  const myPlayer = room.players.find((p) => p.seat === mySeat);
  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* Üst tabela şeridi kaldırıldı: masa tam boy kalır, skorlar yalnızca
          alttaki 📊 Tabela butonuyla açılan pencerede görünür. İsim plakaları
          masanın kenarlarında aynen durur. */}
      <section className="felt game-table relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="banner-glass absolute z-30 max-w-[230px] rounded-full px-3 py-1.5 pointer-events-none leading-tight overflow-hidden" style={{ top: "12px", left: "12px" }}>
          <div className="relative flex items-center gap-1.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#E9B949] text-[#3B2500] grid place-items-center text-[11px] font-black">♛</span>
            <div className="min-w-0">
              <div className="plastic-orange text-[12px] leading-tight truncate">{isPenaltyRoundType(gs.round) ? "▲" : "●"} {gs.round === "Koz-Maça" ? "Koz - Maça" : gs.round === "Koz-Kupa" ? "Koz - Kupa" : gs.round === "Koz-Karo" ? "Koz - Karo" : gs.round === "Koz-Sinek" ? "Koz - Sinek" : gs.round}</div>
              <div className="text-[9px] font-bold text-white leading-tight mt-0.5 truncate">Tur {gs.roundsPlayed + 1}/20 • Oda {room.code} • Seçen: {chooserName}</div>
            </div>
          </div>
        </div>
        <div className="absolute top-1 right-1 z-30 flex items-center gap-1 pointer-events-none">
          <div className="bg-black/50 rounded-full px-2 py-0.5 text-[9px] font-bold text-white/85 whitespace-nowrap">{gs.phase === "select-round" ? `Seçim: ${chooserName}` : `El ${Math.min(gs.trickNo, 13)}/13 • ${gs.phase === "playing" ? (gs.current === -1 ? "Hesaplanıyor…" : `Sıra: ${displayPlayerName(room.players.find((p) => p.seat === gs.current)?.name ?? "", gs.current)}`) : gs.phase === "finished" ? "Tur bitti" : ""}`}</div>
          <div className="bg-black/50 rounded-full px-2 py-0.5 text-[9px] font-bold text-white/85 whitespace-nowrap">{(gs.round === "Kupa Almaz" || gs.round === "Rıfkı") ? (gs.heartsBroken ? "Kupa 🔓" : "Kupa 🔒") : isKoz ? (gs.trumpBroken ? "Koz 🔓" : "Koz 🔒") : ""}</div>
        </div>
        {notice && <div className="absolute top-7 left-1/2 -translate-x-1/2 z-30 bg-black/70 text-white rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap">{notice}</div>}
        {/* Opponent closed hands */}
        {room.players.filter((p) => p.seat !== mySeat).map((p) => {
          const rel = relOf(p.seat); const pos = posForRel(rel);
          const count = gs.hands[p.seat]?.length ?? 0;
          const isTurn = gs.current === p.seat && gs.phase === "playing";
          const namePlate = (
            <div className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold text-center leading-tight whitespace-nowrap min-w-[92px] border-2 border-[var(--gold)] shadow-lg ${isTurn ? "bg-[var(--gold)] text-black" : "bg-black/80 text-white"}`}>{displayPlayerName(p.name, p.seat)}{p.isBot ? " 🤖" : ""} <span className="text-[var(--gold)]">•</span> <span className="text-[13px] font-black text-[var(--gold)]">{gs.baseTotals[p.seat] >= 0 ? `+${gs.baseTotals[p.seat]}` : gs.baseTotals[p.seat]}</span><span className="block text-[9px] font-bold opacity-90">Bu tur: {estimated[p.seat] >= 0 ? `+${estimated[p.seat]}` : estimated[p.seat]}{isTurn ? " • Sıra" : ""}</span></div>
          );
          const closedHand = (
            <div className="relative shrink-0" style={pos === "top" ? { width: `${60 + Math.max(0, count - 1) * 9}px`, height: "86px" } : { width: "56px", height: `${78 + Math.max(0, count - 1) * 8}px` }}>
              {Array.from({ length: count }).map((_, k) => {
                const mid = (count - 1) / 2;
                if (pos === "top") return (<div key={k} className="absolute top-0" style={{ left: `${k * 9}px`, transform: `rotate(${(k - mid) * 2.5}deg)`, transformOrigin: "top center" }}><CardBack className="w-[60px] h-[84px]" /></div>);
                return (<div key={k} className="absolute" style={{ top: `${k * 8}px`, left: "50%", transform: `translateX(-50%) rotate(${(k - mid) * 2.5}deg)` }}><CardBack className="w-[56px] h-[78px]" /></div>);
              })}
            </div>
          );
          const pile = <TakenPile taken={gs.takenCards[p.seat] || []} round={gs.round} orientation={pos === "top" ? "column" : "row"} />;
          if (pos === "top") return (
            <div key={p.seat} className="absolute z-10 top-1 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" aria-label={`${displayPlayerName(p.name, p.seat)} kapalı eli`}>
              <div className="flex items-start gap-1">{closedHand}{pile}</div>
              {namePlate}
            </div>
          );
          if (pos === "left") return (
            <div key={p.seat} className="absolute z-10 left-1 top-1/2 -translate-y-1/2 flex flex-row items-start gap-1" aria-label={`${displayPlayerName(p.name, p.seat)} kapalı eli`}>
              {closedHand}
              <div className="flex flex-col gap-1 items-start">{pile}{namePlate}</div>
            </div>
          );
          return (
            <div key={p.seat} className="absolute z-10 right-1 top-1/2 -translate-y-1/2 flex flex-row items-start gap-1" aria-label={`${displayPlayerName(p.name, p.seat)} kapalı eli`}>
              <div className="flex flex-col gap-1 items-end">{pile}{namePlate}</div>
              {closedHand}
            </div>
          );
        })}
        {/* Küçük kart yığınları kaldırıldı: üstteki botun kapalı elinin
            üstüne biniyorlardı. Oynanan kartlar yalnızca masa ortasında,
            yenen kart özeti ise Tabela penceresinde görünür. */}
        {/* Trick cards */}
        {gs.trick.filter((t) => t.player !== mySeat).map((t) => {
          const rel = relOf(t.player);
          const pos = rel === 1 ? { left: "26%", top: "50%" } : rel === 2 ? { left: "50%", top: "32%" } : { left: "74%", top: "50%" };
          const label = displayPlayerName(room.players.find((p) => p.seat === t.player)?.name ?? "", t.player);
          return (<div key={`${t.player}-${t.card.id}`} className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: pos.left, top: pos.top }}><div className="deal"><MiniCard card={t.card} /></div><div className="text-center text-[9px] font-extrabold mt-1 bg-black/55 text-white rounded-full px-1.5 py-px whitespace-nowrap">{label}</div></div>);
        })}
        {gs.trick.find((t) => t.player === mySeat) && (
          <div className="absolute z-20 left-1/2 -translate-x-1/2" style={{ bottom: "196px" }}><div className="play-up"><MiniCard card={gs.trick.find((t) => t.player === mySeat)!.card} /></div><div className="text-center text-[9px] font-extrabold mt-1 bg-[var(--gold)] text-black rounded-full px-2 py-px whitespace-nowrap">Senin Attığın</div></div>
        )}
        {gs.trick.length === 4 && (<div className="absolute left-1/2 -translate-x-1/2 z-40 bg-[var(--gold)] text-black rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-lg whitespace-nowrap top-[62%]" role="status">Eli Kazanan: {trickWinnerName} 🏆</div>)}
        {gs.phase === "playing" && gs.current === mySeat && (<div className="absolute left-1/2 -translate-x-1/2 z-40 bg-[var(--gold)] text-black rounded-full px-3 py-1 text-[11px] font-extrabold shadow-lg whitespace-nowrap" style={{ bottom: "212px" }}>Sıra sende ✨</div>)}
        {gs.phase === "playing" && gs.current !== mySeat && gs.current >= 0 && (<div className="absolute left-1/2 -translate-x-1/2 z-40 bg-black/60 text-white rounded-full px-3 py-1 text-[11px] font-extrabold whitespace-nowrap" style={{ bottom: "212px" }}>Sıra: {displayPlayerName(room.players.find((p) => p.seat === gs.current)?.name ?? `Koltuk ${gs.current + 1} (boş)`, gs.current)} bekleniyor…{!room.players.find((p) => p.seat === gs.current) ? " — bu koltuk boş, atlanıyor" : ""}</div>)}
        {gs.phase === "playing" && isKoz && gs.trick.length === 0 && gs.current === mySeat && !gs.trumpBroken && seqCard && (<div className="absolute left-1/2 -translate-x-1/2 z-40 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none bg-black/60 text-white" style={{ bottom: "238px" }}>Koz oynamak istersen A-K-Q sırayla oynamalısın: sıradaki {seqCard.rank}. Başka renk de açabilirsin, serbestsin.</div>)}
        {gs.phase === "playing" && isKoz && gs.trick.length === 0 && gs.current === mySeat && gs.trumpBroken && committedCard && (<div className="absolute left-1/2 -translate-x-1/2 z-40 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none bg-black/60 text-white" style={{ bottom: "238px" }}>A ile kozu sen açtın - şimdi {committedCard.rank === "Q" ? "Q'yu" : "K'yı"} oynamalısın (koz açarsan). Başka renk açmak serbest.</div>)}
        {mustHint && gs.phase === "playing" && (<div className="absolute left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white rounded-xl px-2.5 py-1 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none" style={{ bottom: "238px" }}>{mustHint}</div>)}
        {gs.phase === "finished" && (<div className="absolute left-1/2 -translate-x-1/2 top-[30%] z-40 bg-[var(--gold)] text-black rounded-full px-3 py-1.5 text-[12px] font-extrabold shadow-lg whitespace-nowrap">Tur bitti — Yeni tur başlıyor…</div>)}
        {/* Engellenen kart açıklaması — sessizce gri kalmaz, nedenini söyler */}
        {blockedInfo && gs.phase === "playing" && gs.current === mySeat && (
          <div className="absolute left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white rounded-xl px-3 py-2 text-[11px] font-extrabold text-center shadow-lg max-w-[92%] flex items-start gap-2" style={{ bottom: "212px" }} role="status">
            <span className="flex-1">{blockedInfo.text}</span>
            <button onClick={() => setBlockedInfo(null)} className="shrink-0 bg-white/20 rounded-full w-5 h-5 grid place-items-center text-[12px] leading-none" aria-label="Uyarıyı kapat">✕</button>
          </div>
        )}
        {/* My hand — always fully visible above the taskbar: shrink-0, 12px bottom padding */}
        <div className="game-hand absolute bottom-0 left-0 right-0 z-30 pt-1 pb-3 shrink-0" style={{ background: "rgba(0,0,0,0.35)" }}>
          <div className="flex items-end gap-1 px-1">
          <div className="flex-1 min-w-0">
          <div className="flex justify-center items-center gap-1 px-1"><div className="rounded-full px-4 py-1.5 text-[13px] font-extrabold text-white bg-black/80 border-2 border-[var(--gold)] shadow-lg whitespace-nowrap">{myName}{myPlayer?.isBot ? " 🤖" : ""} <span className="text-[var(--gold)]">•</span> <span className="text-[15px] font-black text-[var(--gold)]">{gs.baseTotals[mySeat] >= 0 ? `+${gs.baseTotals[mySeat]}` : gs.baseTotals[mySeat]}</span> <span className="text-[11px]">• {gs.hands[mySeat]?.length ?? 0} kart {gs.phase === "playing" && gs.current === mySeat ? "• Sıra sende" : gs.phase === "playing" ? `• Sıra: ${displayPlayerName(room.players.find((p) => p.seat === gs.current)?.name ?? "", gs.current)}` : gs.phase === "select-round" ? (chooser === mySeat ? "• Tur seç" : `• ${chooserName} seçiyor`) : ""}{saving ? " • Kaydediliyor…" : ""}</span></div></div>
          <div className="flex justify-center overflow-x-clip pt-1 pb-1 px-1">
            {displayHand.map((c, idx) => {
              const playable = playableIds.has(c.id) && gs.phase === "playing" && gs.current === mySeat;
              const disabled = gs.phase === "playing" && gs.current === mySeat && !playable;
              const isMustPlay = blockedInfo?.mustId === c.id && gs.phase === "playing" && gs.current === mySeat;
              const mid = (displayHand.length - 1) / 2;
              return (
                <button key={c.id} type="button" aria-disabled={gs.phase !== "playing" || gs.current !== mySeat} onClick={() => handleMyCardClick(c)} title={disabled ? blockedReasonFor(c) : `${c.rank} ${c.suit} — oynamak için tıkla`} aria-label={`${c.rank} ${c.suit}${disabled ? " - oynanamaz" : ""}`} className={`relative -ml-[10px] first:ml-0 sm:-ml-[6px] ${playable ? "playable ring-[3px] ring-[var(--gold)] rounded-[8px] brightness-110" : ""} ${disabled ? "disabled-card rounded-[8px]" : ""} ${isMustPlay ? "must-play" : ""}`} style={{ transform: `rotate(${(idx - mid) * 1.6}deg) translateY(${Math.abs(idx - mid) * 0.8}px)`, zIndex: playable ? 50 + idx : idx }}>
                  {isMustPlay && <span className="must-play-label">Oynaman gereken kart</span>}
                  <RealCard card={c} className="hand-card w-[70px] h-[100px] sm:w-[94px] sm:h-[134px] pointer-events-none" cornerSize="text-[19px] sm:text-[22px]" centreSize="text-[32px] sm:text-[42px]" suitSize="text-[13px] sm:text-[14px]" />
                  {playable && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--gold)]" />}
                </button>
              );
            })}
          </div>
          </div>
          <TakenPile taken={gs.takenCards[mySeat] || []} round={gs.round} orientation="column" />
          </div>
        </div>
        {/* Selection */}
        {gs.phase === "select-round" && chooser === mySeat && (
          <div className="fixed inset-0 z-50 bg-black/25 flex items-start justify-center p-2 pt-[5vh] pointer-events-none" role="dialog" aria-modal="true" aria-label="Tur Seç">
            <div className="pop pointer-events-auto bg-white/95 backdrop-blur-sm text-black rounded-2xl w-[min(480px,92vw)] max-h-[62vh] overflow-y-auto p-2.5 shadow-lg border border-[#CBD5E1]">
              <p className="text-[11px] font-extrabold text-[#0f5b36]">Tur Seç — Seçim: {myName}</p>
              <p className="text-[10px] font-semibold text-[#55645b] mt-0.5">Bir tur seç ve BAŞLA&apos;ya bas. Elin altta görünüyor.</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <div><h4 className="font-extrabold text-[10px] text-[#7a1f2b] mb-1">CEZALAR ▲</h4><div className="grid gap-1">{PENALTY_ROUNDS.map((r) => { const avail = chooserAvail.includes(r); const sel = selected === r; return (<button key={r} disabled={!avail} onClick={() => setSelected(r)} className={`text-left rounded-full px-2 py-1 border text-[11px] font-extrabold ${sel ? "bg-[#D1FAE5] border-[#059669]" : "bg-white border-[#CBD5E1]"} ${!avail ? "opacity-50 cursor-not-allowed" : ""}`}>▲ {r}{!avail ? " • Oynandı" : ""}</button>); })}</div></div>
                <div><h4 className="font-extrabold text-[10px] text-[#0f5b36] mb-1">KOZLAR ●</h4><div className="grid gap-1">{TRUMP_ROUNDS.map((r) => { const avail = chooserAvail.includes(r); const sel = selected === r; return (<button key={r} disabled={!avail} onClick={() => setSelected(r)} className={`text-left rounded-full px-2 py-1 border text-[11px] font-extrabold ${sel ? "bg-[#D1FAE5] border-[#059669]" : "bg-white border-[#CBD5E1]"} ${!avail ? "opacity-50 cursor-not-allowed" : ""}`}>● {r === "Koz-Maça" ? "Koz - Maça" : r === "Koz-Kupa" ? "Koz - Kupa" : r === "Koz-Karo" ? "Koz - Karo" : "Koz - Sinek"}</button>); })}</div></div>
              </div>
              <div className="mt-2 flex gap-2"><button onClick={() => { if (chooserAvail.length) setSelected(chooserAvail[Math.floor(Math.random() * chooserAvail.length)]); }} className="bg-white border border-black/15 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Dices size={13} /> Rastgele</button><button onClick={() => selected && selectRound(selected)} disabled={!selected || saving} className={`flex-1 font-extrabold text-[12px] py-1.5 rounded-lg ${selected ? "bg-[#059669] text-white" : "bg-[#E2E8F0] text-black/40 cursor-not-allowed"}`}>BAŞLA ▶ {selected ? selected : "Önce bir tur seç"}</button></div>
            </div>
          </div>
        )}
        {gs.phase === "select-round" && chooser !== mySeat && (
          <div className="absolute left-1/2 -translate-x-1/2 top-[38%] z-40 bg-white text-black rounded-2xl px-4 py-3 text-center shadow-lg max-w-[92%]"><p className="font-extrabold text-[13px]">Seçen: {chooserName} bekleniyor…</p><p className="text-[11px] font-semibold text-[#55645b] mt-0.5">{chooserName} eline bakıp bir tur seçiyor.</p></div>
        )}
        {gs.phase === "match-finished" && (
          <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" role="dialog" aria-modal="true">
            <div className="pop bg-white text-black rounded-3xl w-full max-w-[560px] p-5 max-h-[92vh] overflow-y-auto">
              <div className="text-center"><div className="text-[36px]">🏆</div><h2 className="font-display font-black text-[26px]">Maç Bitti — Final Sıralaması</h2><p className="text-[12px] font-bold text-[#55645b]">Oda {room.code} • 20 tur tamamlandı</p></div>
              <div className="grid gap-2 mt-4">{finalOrder.map((seat, rank) => { const p = room.players.find((x) => x.seat === seat)!; return (<div key={seat} className={`rounded-2xl border p-3 flex items-center gap-3 ${rank === 0 ? "border-[var(--gold)] bg-[#fff3c4]" : "border-black/10 bg-white"}`}><span className="font-display font-black text-[20px] w-7">{rank + 1}.</span><span className="font-extrabold flex-1">{displayPlayerName(p.name, p.seat)}{p.isBot ? " 🤖" : ""}{rank === 0 ? " 👑" : ""}</span><span className="font-black text-[20px]">{gs.baseTotals[seat]} puan</span></div>); })}</div>
              <p className="text-[11px] font-semibold text-[#55645b] mt-3 text-center">Bu Tur: {gs.lastRoundScores ? gs.lastRoundScores.map((s, i) => `${displayPlayerName(room.players.find((x) => x.seat === i)?.name ?? "", i)} ${s >= 0 ? `+${s}` : s}`).join(" • ") : ""}</p>
              <button onClick={onNewMatch} disabled={!isHost} className={`mt-4 w-full font-extrabold py-3.5 rounded-xl ${isHost ? "bg-[#0f5b36] text-white" : "bg-black/10 text-black/40 cursor-not-allowed"}`}>YENİ OYUN ▶ {isHost ? "" : "(Ev sahibi başlatır)"}</button>
              <button onClick={onBackToLobby} disabled={!isHost} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-3 rounded-xl">LOBİYE DÖN {isHost ? "" : "(Ev sahibi)"}</button>
              <button onClick={onLeave} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-3 rounded-xl">Oyunu Kapat / Odadan Ayrıl</button>
              {onCloseTable && (<button onClick={async () => { setClosingTable(true); try { await onCloseTable(); } finally { setClosingTable(false); } }} disabled={closingTable} className="mt-2 w-full bg-red-600 text-white font-extrabold py-3 rounded-xl">Masayı Kapat ✕ {closingTable ? "Kapatılıyor…" : ""}</button>)}
            </div>
          </div>
        )}
      </section>
      <div className="shrink-0 bg-[#07130d] px-2 py-1 flex items-center gap-2 text-[11px] font-bold">
        <span className="bg-white/10 rounded-full px-2 py-0.5">Oda: {room.code}</span>
        <button onClick={() => setShowScoreboard(true)} className="bg-[var(--gold)] text-black font-extrabold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1"><Trophy size={13} /> Tabela</button>
        <SpeedControl />
        <span className="hidden sm:inline text-white/70">{roundInfo.score} • {roundInfo.desc}</span>
        <span className="bg-white/10 rounded-full px-2 py-0.5" aria-live="polite">{saving ? "🔄 Senkronize ediliyor…" : notice.includes("tekrar") ? "🔄 Yavaş bağlantı" : "⚡ Canlı"}</span>
        {lastMoveId && <span className="hidden sm:inline bg-white/10 rounded-full px-2 py-0.5 text-[9px] font-mono text-white/60 truncate max-w-[180px]" title={lastMoveId}>Son hamle: {lastMoveId}</span>}
        <button onClick={onLeave} className="ml-auto bg-white/10 border border-white/15 rounded-md px-2 py-1 flex items-center gap-1" title="Oyunu kapat — sadece bot kalırsa masa da kapanır"><LogOut size={12} /> Oyunu Kapat</button>
        {onCloseTable && (<button onClick={async () => { setClosingTable(true); try { await onCloseTable(); } finally { setClosingTable(false); } }} disabled={closingTable} className="bg-red-600 text-white rounded-md px-2 py-1 font-extrabold">Masayı Kapat ✕</button>)}
      </div>
      {showScoreboard && (
        <div className="fixed inset-0 z-[70] bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Tabela" onClick={(e) => { if (e.target === e.currentTarget) setShowScoreboard(false); }}>
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[520px] max-h-[86vh] overflow-y-auto p-4 shadow-lg border border-[#CBD5E1]">
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-display font-black text-[22px] flex items-center gap-2"><Trophy size={18} className="text-[#0f5b36]" /> TABELA</h2><p className="text-[12px] font-semibold text-[#55645b]">Oda {room.code} • Tur {gs.roundsPlayed + 1}/20 • {gs.round} • {roundInfo.score}</p><p className="text-[11px] font-bold text-[#0f5b36] mt-0.5">{roundInfo.desc}</p></div>
              <button onClick={() => setShowScoreboard(false)} className="p-2 bg-black/5 rounded-full shrink-0" aria-label="Tabelayı kapat"><X size={18} /></button>
            </div>
            <div className="mt-3">
              <ScoreboardTable names={room.players.map((p) => displayPlayerName(p.name, p.seat))} history={gs.roundHistory ?? []} totals={gs.baseTotals} currentIndex={gs.roundsPlayed} currentRound={gs.round} currentScores={estimated} />
            </div>
            <button onClick={() => setShowScoreboard(false)} className="mt-4 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl">Masaya Dön</button>
          </div>
        </div>
      )}
    </div>
  );
}
function FriendsMode({ onBack }: { onBack: () => void }){
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState(() => { try { const p = new URLSearchParams(window.location.search); return (p.get("room") || "").toUpperCase(); } catch { return ""; } });
  const [step, setStep] = useState<"entry" | "lobby" | "game">("entry");
  const [room, setRoom] = useState<RoomValue | null>(null);
  const [roomRecordId, setRoomRecordId] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  async function fetchRoomByCode(code: string){
    const data = await callRecords("records.list", { collection: "king-tournament" }) as { records?: { id: string; value?: unknown }[] } | null;
    const recs = Array.isArray(data?.records) ? data!.records! : [];
    for (const r of recs) {
      const v = r?.value as RoomValue | undefined;
      if (v && (v as RoomValue).type === "room" && (v as RoomValue).code === code.toUpperCase()) return { id: r.id, value: { ...v, players: (v as RoomValue).players.map((p) => ({ ...p, name: displayPlayerName(p.name, p.seat) })) } as RoomValue };
    }
    return null;
  }
  async function persistRoom(code: string, mutator: (r: RoomValue) => RoomValue){
    // Optimistic UI: show the move / seat / choice instantly from local state,
    // then sync to the records API in the background. A failed sync retries
    // once and shows "tekrar deneniyor" — it never blocks the table.
    const optimistic = room && room.code === code ? mutator(room) : null;
    if (optimistic) setRoom(optimistic);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const found = await fetchRoomByCode(code);
        if (!found) throw new Error("Oda bulunamadı.");
        const next = attempt === 0 && optimistic ? optimistic : mutator(found.value);
        await callRecords("records.replace", { collection: "king-tournament", id: found.id, value: next });
        setRoom(next); setRoomRecordId(found.id);
        return next;
      } catch (e) {
        lastError = e;
        if (attempt === 0) { setNotice("🔄 Tekrar deneniyor…"); await new Promise((r) => setTimeout(r, 800)); }
      }
    }
    setNotice("Tekrar deneniyor — bağlantı düzelince hamlen yeniden gönderilecek.");
    throw lastError instanceof Error ? lastError : new Error("Oda kaydedilemedi.");
  }
  useEffect(() => {
    if (!room) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const found = await fetchRoomByCode(room.code);
        if (!found) return;
        setRoom((prev) => {
          if (!prev) return found.value;
          if (REALTIME_ACTIVE) return prev;
          // Never let a stale poll echo overwrite a newer local state:
          // a poll that is not newer than what we already show is ignored,
          // so an optimistic card does not disappear and get replayed.
          if (found.value.updatedAt <= prev.updatedAt) return prev;
          // A poll carrying a trick we already collected locally is stale.
          const prevCollected = prev.gameState?.collectedTrickIds ?? [];
          const foundTrick = found.value.gameState?.trick ?? [];
          if (prevCollected.length && foundTrick.length === 4 && prev.gameState) {
            const tid = makeTrickId(found.value.gameState!.round, found.value.gameState!.trickNo, foundTrick);
            if (prevCollected.includes(tid)) return prev;
          }
          return found.value;
        });
        setRoomRecordId(found.id);
        if (found.value.status === "playing" && found.value.gameState) setStep("game");
        if (found.value.status === "lobby") setStep("lobby");
      } catch { /* polling continues */ }
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);
  useEffect(() => {
    if (room && room.status === "playing" && room.gameState) setStep("game");
    if (room && room.status === "lobby") setStep((s) => s === "game" ? "lobby" : s);
  }, [room?.status]);
  function makeCode(){
    const digits = String(Math.floor(Math.random() * 90) + 10);
    return `KING${digits}`;
  }
  async function createRoom(){
    const name = nickname.trim();
    if (name.length < 2) { setError("Takma ad en az 2 harf olmalı."); return; }
    if (name.length > 14) { setError("Takma ad en fazla 14 harf olmalı."); return; }
    setBusy(true); setError("");
    try {
      let code = makeCode();
      for (let i = 0; i < 5; i++) { const ex = await fetchRoomByCode(code); if (!ex) break; code = makeCode(); }
      const value: RoomValue = { type: "room", code, host: name, hostSeat: 0, players: [{ name, seat: 0, ready: false, isBot: false }], status: "lobby", gameState: null, updatedAt: Date.now() };
      await callRecords("records.create", { collection: "king-tournament", value, idempotency_key: `room-${code}` });
      const found = await fetchRoomByCode(code);
      if (found) { setRoomRecordId(found.id); setRoom(found.value); } else { setRoom(value); }
      setMySeat(0); setStep("lobby"); setNotice(`Oda kuruldu: ${code}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Oda kurulamadı."); } finally { setBusy(false); }
  }
  async function joinRoom(){
    const name = nickname.trim();
    const code = joinCode.trim().toUpperCase();
    if (name.length < 2) { setError("Takma ad en az 2 harf olmalı."); return; }
    if (code.length !== 6) { setError("Oda kodu 6 karakter olmalı (örn. KING42)."); return; }
    setBusy(true); setError("");
    try {
      const found = await fetchRoomByCode(code);
      if (!found) { setError("Bu kodla bir oda bulunamadı. Kodu kontrol et."); return; }
      const rv = found.value;
      if (rv.status === "playing" && rv.gameState) {
        const existing = rv.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!existing) { setError("Bu oda oyunda ve bu isimle bir oyuncu yok."); return; }
        setRoom(rv); setRoomRecordId(found.id); setMySeat(existing.seat); setStep("game"); return;
      }
      const existing = rv.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) { setRoom(rv); setRoomRecordId(found.id); setMySeat(existing.seat); setStep("lobby"); setNotice(`${name} olarak aynı koltuğa yeniden katıldın.`); return; }
      if (rv.players.length >= 4) { setError("Oda dolu (4/4)."); return; }
      const used = new Set(rv.players.map((p) => p.seat));
      const seat = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 0;
      const next: RoomValue = { ...rv, players: [...rv.players, { name, seat, ready: false, isBot: false }], updatedAt: Date.now() };
      await callRecords("records.replace", { collection: "king-tournament", id: found.id, value: next });
      setRoom(next); setRoomRecordId(found.id); setMySeat(seat); setStep("lobby"); setNotice(`Odaya katıldın — Koltuk ${seat + 1}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Odaya katılınamadı."); } finally { setBusy(false); }
  }
  async function toggleReady(){
    if (!room || mySeat === null) return;
    setBusy(true);
    try { await persistRoom(room.code, (r) => ({ ...r, players: r.players.map((p) => p.seat === mySeat ? { ...p, ready: !p.ready } : p), updatedAt: Date.now() })); } catch (e) { setError(e instanceof Error ? e.message : "Hazır durumu güncellenemedi."); } finally { setBusy(false); }
  }
  async function addBot(){
    if (!room || mySeat === null) return;
    const isHost = room.hostSeat === mySeat;
    if (!isHost) return;
    const used = new Set(room.players.map((p) => p.seat));
    const seat = [0, 1, 2, 3].find((s) => !used.has(s));
    if (seat === undefined) { setError("Boş koltuk yok."); return; }
    const usedNames = new Set(room.players.map((p) => p.name));
    const botName = BOT_POOL.find((n) => !usedNames.has(n)) ?? `Bot ${seat + 1}`;
    setBusy(true);
    try { await persistRoom(room.code, (r) => ({ ...r, players: [...r.players, { name: botName, seat, ready: true, isBot: true }], updatedAt: Date.now() })); } catch (e) { setError(e instanceof Error ? e.message : "Bot eklenemedi."); } finally { setBusy(false); }
  }
  async function removeBot(seat: number){
    if (!room || mySeat === null || room.hostSeat !== mySeat) return;
    setBusy(true);
    try { await persistRoom(room.code, (r) => ({ ...r, players: r.players.filter((p) => p.seat !== seat), updatedAt: Date.now() })); } catch (e) { setError(e instanceof Error ? e.message : "Bot çıkarılamadı."); } finally { setBusy(false); }
  }
  async function startGame(){
    if (!room || mySeat === null || room.hostSeat !== mySeat) return;
    if (room.players.length !== 4) { setError("Başlamak için 4 oyuncu gerekli."); return; }
    if (!room.players.every((p) => p.ready)) { setError("Herkes Hazır olmalı."); return; }
    setBusy(true);
    try {
      const gs = dealFriendGame(null);
      await persistRoom(room.code, (r) => ({ ...r, status: "playing", gameState: gs, updatedAt: Date.now() }));
      setStep("game"); setNotice("Oyun başladı!");
    } catch (e) { setError(e instanceof Error ? e.message : "Oyun başlatılamadı."); } finally { setBusy(false); }
  }
  async function leaveRoom(){
    if (!room || mySeat === null) { setStep("entry"); setRoom(null); setMySeat(null); return; }
    setBusy(true);
    try {
      const found = await fetchRoomByCode(room.code);
      if (found) {
        const remaining = found.value.players.filter((p) => p.seat !== mySeat);
        // Only bots left -> close the room entirely, do not leave an orphan bot-only room.
        if (!remaining.length || !remaining.some((p) => !p.isBot)) { await callRecords("records.delete", { collection: "king-tournament", id: found.id }); }
        else {
          const wasHost = found.value.hostSeat === mySeat;
          const nextHost = wasHost ? remaining[0] : found.value.players.find((p) => p.seat === found.value.hostSeat) ?? remaining[0];
          const next: RoomValue = { ...found.value, players: remaining, host: nextHost.name, hostSeat: nextHost.seat, status: found.value.status === "playing" && remaining.length < 2 ? "lobby" : found.value.status, gameState: found.value.status === "playing" && remaining.length < 2 ? null : found.value.gameState, updatedAt: Date.now() };
          await callRecords("records.replace", { collection: "king-tournament", id: found.id, value: next });
        }
      }
    } catch { /* leave locally anyway */ } finally { setBusy(false); setRoom(null); setMySeat(null); setStep("entry"); setNotice("Odadan ayrıldın."); }
  }
  async function saveGame(gs: FriendGameState){
    if (!room) return;
    await persistRoom(room.code, (r) => ({ ...r, gameState: gs, updatedAt: Date.now() }));
  }
  async function backToLobby(){
    if (!room || mySeat === null || room.hostSeat !== mySeat) return;
    await persistRoom(room.code, (r) => ({ ...r, status: "lobby", gameState: null, players: r.players.map((p) => ({ ...p, ready: false })), updatedAt: Date.now() }));
    setStep("lobby");
  }
  async function newMatch(){
    if (!room || mySeat === null || room.hostSeat !== mySeat) return;
    const gs = dealFriendGame(null);
    await persistRoom(room.code, (r) => ({ ...r, status: "playing", gameState: gs, updatedAt: Date.now() }));
    setStep("game");
  }
  const isHost = room !== null && mySeat !== null && room.hostSeat === mySeat;
  const roomLink = room ? `${window.location.href.split("?")[0]}?room=${room.code}` : "";
  if (step === "game" && room?.gameState && mySeat !== null) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
        <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
          <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
          <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
          <span className="text-[11px] font-bold text-white/70 hidden sm:inline">Arkadaşlarla • Oda {room.code}</span>
          <div className="ml-auto flex items-center gap-1.5"><button onClick={leaveRoom} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><LogOut size={13} /> Ayrıl</button></div>
        </header>
        <main className="flex-1 min-h-0 flex flex-col w-full"><FriendsTable room={room} mySeat={mySeat} isHost={isHost} onSaveGame={saveGame} onBackToLobby={backToLobby} onNewMatch={newMatch} onLeave={leaveRoom} /></main>
      </div>
    );
  }
  if (step === "lobby" && room) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
        <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
          <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
          <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
          <button onClick={onBack} className="ml-auto bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><Home size={13} /> Menü</button>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="max-w-[560px] mx-auto">
            <div className="bg-white text-black rounded-3xl p-4 sm:p-5 shadow-lg border border-[#CBD5E1]">
              <p className="text-[11px] font-extrabold tracking-widest text-[#55645b]">ODA KODU</p>
              <p className="font-display font-black text-[42px] leading-none tracking-wide mt-1">{room.code}</p>
              <p className="text-[12px] font-semibold text-[#55645b] mt-1">Arkadaşların bu kodla katılsın. Kod 1.5 saniyede bir yenilenir.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => { copyTextViaField(room.code); setNotice("Kod kopyalandı."); }} className="bg-[#0f5b36] text-white font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1"><Copy size={14} /> Kodu Kopyala</button>
                <button onClick={() => { copyTextViaField(roomLink); setNotice("Link kopyalandı."); }} className="bg-white border border-black/15 font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1"><Copy size={14} /> Linki Kopyala</button>
                <button onClick={leaveRoom} className="bg-white border border-black/15 font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1"><LogOut size={14} /> Odadan Ayrıl</button>
              </div>
              <label className="block mt-3 text-[11px] font-bold text-[#55645b]">Davet linki (kopyalamak için seç)</label>
              <input readOnly value={roomLink} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full border border-black/15 rounded-lg px-2 py-2 text-[12px] font-semibold bg-[#F8FAFC]" aria-label="Davet linki" />
              {notice && <p className="mt-2 text-[12px] font-bold text-emerald-700">{notice}</p>}
              {error && <p className="mt-2 text-[12px] font-bold text-red-700">{error}</p>}
            </div>
            <div className="bg-white text-black rounded-3xl p-4 sm:p-5 mt-3 shadow-lg border border-[#CBD5E1]">
              <h2 className="font-extrabold text-[15px]">Oyuncular • {room.players.length}/4</h2>
              <div className="grid gap-2 mt-3">
                {[0, 1, 2, 3].map((seat) => {
                  const p = room.players.find((x) => x.seat === seat);
                  if (!p) return (<div key={seat} className="border border-dashed border-black/20 rounded-2xl p-3 flex items-center gap-2 text-black/50"><span className="w-8 h-8 rounded-full bg-black/5 grid place-items-center text-[12px] font-black">{seat + 1}</span><span className="font-bold text-[13px]">Boş koltuk — bekleniyor…</span></div>);
                  const isMe = p.seat === mySeat;
                  return (<div key={seat} className={`border rounded-2xl p-3 flex items-center gap-2 ${isMe ? "border-[#059669] bg-[#ECFDF5]" : "border-black/10 bg-white"}`}><span className="w-8 h-8 rounded-full bg-[#0f5b36] text-white grid place-items-center text-[12px] font-black">{p.name.slice(0, 1).toUpperCase()}</span><div className="flex-1 min-w-0"><p className="font-extrabold text-[13px] truncate">{displayPlayerName(p.name, p.seat)}{p.isBot ? " 🤖" : ""}{room.hostSeat === seat ? " 👑 Ev sahibi" : ""}{isMe ? " (Sen)" : ""}</p><p className="text-[11px] font-bold text-[#55645b]">Koltuk {seat + 1} • {p.ready ? "Hazır ✓" : "Hazır değil"}</p></div>{isMe && !p.isBot && (<button onClick={toggleReady} disabled={busy} className={`shrink-0 font-extrabold text-[12px] px-3 py-2 rounded-lg ${p.ready ? "bg-white border border-black/15" : "bg-[#059669] text-white"}`}>{p.ready ? "Hazır Değilim" : "Hazır Ol"}</button>)}{p.isBot && isHost && (<button onClick={() => removeBot(seat)} className="shrink-0 bg-white border border-black/15 font-extrabold text-[12px] px-2 py-2 rounded-lg">Çıkar</button>)}</div>);
                })}
              </div>
              {room.players.length < 4 && (<p className="mt-3 text-[12px] font-bold text-[#7a1f2b]">{room.players.length}/4 oyuncu bekleniyor… Arkadaşını davet etmek için yukarıdaki kodu / linki paylaş.</p>)}
              {isHost && room.players.length < 4 && (<button onClick={addBot} disabled={busy} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1"><Plus size={15} /> Bot Ekle</button>)}
              {isHost && (<button onClick={startGame} disabled={busy || room.players.length !== 4 || !room.players.every((p) => p.ready)} className={`mt-2 w-full font-extrabold py-3.5 rounded-xl ${room.players.length === 4 && room.players.every((p) => p.ready) ? "bg-[#0f5b36] text-white" : "bg-black/10 text-black/40 cursor-not-allowed"}`}>OYUNU BAŞLAT ▶ {room.players.length !== 4 ? `(${room.players.length}/4)` : !room.players.every((p) => p.ready) ? "(Herkes hazır olmalı)" : ""}</button>)}
              {!isHost && (<p className="mt-3 text-[12px] font-bold text-[#55645b] text-center">Oyun, 4 oyuncu ve herkes Hazır olunca ev sahibi tarafından başlatılır.</p>)}
            </div>
            <p className="text-center text-[11px] text-white/70 mt-3">Aynı takma ad + aynı kodla yeniden girersen aynı koltuğa ve eline geri dönersin.</p>
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
      <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
        <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
        <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
        <button onClick={onBack} className="ml-auto bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><Home size={13} /> Menü</button>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        <div className="max-w-[560px] mx-auto">
          <div className="bg-white text-black rounded-3xl p-4 sm:p-5 shadow-lg border border-[#CBD5E1]">
            <h1 className="font-display font-black text-[26px] leading-tight">👥 Arkadaşlarla Oyna</h1>
            <p className="text-[12px] font-semibold text-[#55645b] mt-1">Takma adını yaz, oda kur ya da bir kodla katıl. Aynı odadaki herkes aynı oyunu, 1.5 saniyede bir yenilenen oda kaydıyla görür.</p>
            <label className="block mt-4 text-[12px] font-extrabold">Takma Adın</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="örn. Lara" maxLength={14} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Takma adın" />
            {joinCode && <p className="mt-2 text-[12px] font-bold text-emerald-700">Davet linkinden geldin — kod hazır: {joinCode}</p>}
            {error && <p className="mt-2 text-[12px] font-bold text-red-700">{error}</p>}
            {notice && <p className="mt-2 text-[12px] font-bold text-emerald-700">{notice}</p>}
            <div className="grid sm:grid-cols-2 gap-2 mt-4">
              <button onClick={() => setMode(mode === "create" ? "none" : "create")} className={`font-extrabold py-3 rounded-xl flex items-center justify-center gap-1 ${mode === "create" ? "bg-[#0f5b36] text-white" : "bg-white border border-black/15"}`}><Plus size={16} /> ODA KUR</button>
              <button onClick={() => setMode(mode === "join" ? "none" : "join")} className={`font-extrabold py-3 rounded-xl flex items-center justify-center gap-1 ${mode === "join" ? "bg-[#0f5b36] text-white" : "bg-white border border-black/15"}`}><UserPlus size={16} /> ODA KODU İLE KATIL</button>
            </div>
            {mode === "create" && (
              <div className="mt-3 border border-black/10 rounded-2xl p-3 bg-[#F8FAFC]">
                <p className="text-[12px] font-bold text-[#55645b]">6 karakterlik bir kod üretilecek (örn. KING42). Lobide kodu arkadaşlarınla paylaş.</p>
                <button onClick={createRoom} disabled={busy} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl disabled:opacity-60">{busy ? "Kuruluyor…" : "Odayı Kur ▶"}</button>
              </div>
            )}
            {mode === "join" && (
              <div className="mt-3 border border-black/10 rounded-2xl p-3 bg-[#F8FAFC]">
                <label className="block text-[12px] font-extrabold">Oda Kodu (6 karakter)</label>
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="KING42" maxLength={6} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[16px] font-black tracking-widest uppercase" aria-label="Oda kodu" />
                <button onClick={joinRoom} disabled={busy} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-1 disabled:opacity-60"><LogIn size={16} /> {busy ? "Katılınıyor…" : "Odaya Katıl ▶"}</button>
              </div>
            )}
          </div>
          <div className="bg-white/10 border border-white/15 rounded-2xl p-3 mt-3 text-[12px] font-semibold text-white/85 leading-snug">
            <p className="font-extrabold text-white">Nasıl çalışır?</p>
            <p className="mt-1">• Ev sahibi lobiyi kurar, herkes Hazır olur, 4 kişi olunca oyun başlar. • Eksik koltuk Bot Ekle ile doldurulabilir. • Oyundan düşersen aynı takma ad + kodla aynı koltuğa dönersin.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
/* ================= SITE: MEMBERS / ROOMS / TABLES / CHAIRS ================= */
type SiteUser = { username: string; displayName: string };
// GÜVENLİK: SiteUser hiçbir zaman şifre içermez. Üye kaydı okunurken
// yalnızca username / displayName alınır; password alanı bilerek atılır.
// Eski / kirlenmiş bir kayıtta displayName yanlışlıkla şifreye eşitse,
// görünen ad kullanıcı adına düşürülür — şifre asla ekranda gösterilmez.
function safeUserFromMember(m: { username?: unknown; displayName?: unknown; password?: unknown } | null | undefined): SiteUser{
  const username = String(m?.username ?? "").trim().toLowerCase();
  const password = String(m?.password ?? "");
  const rawDisplay = String(m?.displayName ?? "").trim().slice(0, 14);
  // Corrupted row: username column holds the password (username === password).
  // Never surface the password as a name — fall back to "Sen".
  if(username && password && username === password) return { username: "", displayName: "Sen" };
  if(rawDisplay && isAllDigits(rawDisplay)) return { username, displayName: "Sen" };
  const displayName = rawDisplay && rawDisplay !== password ? rawDisplay : username;
  return { username, displayName: isAllDigits(displayName) ? "Sen" : displayName };
}
type SeatValue = { id?: string; username: string; displayName: string; ready: boolean; isBot: boolean };
type TableValue = { type: "table"; roomId: string; roomName: string; name: string; creator: string; status: "waiting" | "playing"; seats: (SeatValue | null)[]; gameState: FriendGameState | null; updatedAt: number };
type TableRec = { id: string; value: TableValue };
type RoomRec = { id: string; value: { type: "room"; name: string; maxTables: number; createdBy: string; createdAt: number } };
/* ================= GAME SUMMARY RETENTION =================
   Masa kapanınca DETAY silinir, ÖZET saklanır.
   Özet = küçük kayıt, hiç kart içermez: tarih, oda, masa, 4 isim,
   final skorlar, kazanan, oynanan tur, süre, matchId, durum, pin.
   Detay (hands / trick / takenCards / collectedTrickIds) özet kaydında
   asla tutulmaz; masa kaydı silinince detay da silinmiş olur. */
type GameSummaryValue = { type: "summary"; date: string; createdAt: number; roomName: string; tableName: string; players: string[]; finalScores: number[]; winner: string; roundsPlayed: number; duration: string; durationMinutes: number; matchId: string; status: "Bitti" | "Yarım Kaldı"; pinned: boolean };
type SummaryRec = { id: string; value: GameSummaryValue };
function summaryAgeDays(s: GameSummaryValue){ return Math.max(0, Math.floor((Date.now() - (s.createdAt || Date.now())) / 86400000)); }
function buildGameSummary(table: TableValue, status: "Bitti" | "Yarım Kaldı"): GameSummaryValue{
  const gs = table.gameState;
  const players = table.seats.map((s, i) => displayNameForSeatLike(s, i));
  const finalScores = gs ? [...gs.baseTotals] : [0, 0, 0, 0];
  const winnerIdx = finalScores.indexOf(Math.max(...finalScores));
  const started = gs?.startedAt ?? table.updatedAt;
  const durationMinutes = Math.max(1, Math.round((Date.now() - started) / 60000));
  const createdAt = Date.now();
  return { type: "summary", date: new Date(createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }), createdAt, roomName: table.roomName, tableName: table.name, players, finalScores, winner: players[winnerIdx] ?? players[0] ?? "", roundsPlayed: gs?.roundsPlayed ?? 0, duration: durationMinutes >= 60 ? `${Math.floor(durationMinutes / 60)} sa ${durationMinutes % 60} dk` : `${durationMinutes} dk`, durationMinutes, matchId: gs?.matchId ?? `mac-${createdAt}`, status, pinned: false };
}
async function saveGameSummaryOnce(table: TableValue, status: "Bitti" | "Yarım Kaldı"): Promise<boolean>{
  if (!table.gameState) return false;
  try {
    const summary = buildGameSummary(table, status);
    const data = await callRecords("records.list", { collection: "king-tournament" }) as { records?: { id: string; value?: unknown }[] };
    const exists = (Array.isArray(data?.records) ? data.records : []).some((r) => (r?.value as { type?: string; matchId?: string })?.type === "summary" && (r?.value as { matchId?: string })?.matchId === summary.matchId);
    if (exists) return true;
    await callRecords("records.create", { collection: "king-tournament", value: summary, idempotency_key: `summary-${summary.matchId}` });
    return true;
  } catch { return false; }
}
const DEFAULT_ROOMS = [
  { name: "Genel Salon", maxTables: 6 },
  { name: "Arkadaşlar", maxTables: 4 },
  { name: "Turnuva Salonu", maxTables: 8 },
];
function avatarColor(name: string){
  const colors = ["#0f5b36", "#7a1f2b", "#1e3a8a", "#7c3aed", "#b45309", "#0e7490"];
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return colors[h % colors.length];
}
function SiteApp({ onBack, onBot }: { onBack: () => void; onBot: () => void }){
  const [user, setUser] = useState<SiteUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authDetail, setAuthDetail] = useState("");
  const [offerAutoRegister, setOfferAutoRegister] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoUsers, setDemoUsers] = useState<{ username: string; password: string; displayName: string }[]>([]);
  const [connBusy, setConnBusy] = useState(false);
  const [connResults, setConnResults] = useState<{ label: string; ok: boolean; detail: string }[]>([]);
  const [connWrite, setConnWrite] = useState("");
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const topMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const isAdmin = user?.username === "onur";
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminLogs, setAdminLogs] = useState<string[]>([]);
  const [adminCounts, setAdminCounts] = useState<{ members: number; rooms: number; tables: number } | null>(null);
  const [adminTestQuery, setAdminTestQuery] = useState("");
  const [adminTestResult, setAdminTestResult] = useState("");
  const [summaries, setSummaries] = useState<SummaryRec[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryNotice, setSummaryNotice] = useState("");
  const [confirmSummaryId, setConfirmSummaryId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  // ••• menüsü: açmak asla çıkış yapmaz, oturumu silmez, sayfadan ayırmaz.
  // Yalnızca menü içindeki “Çıkış Yap” + onay oturumu kapatır.
  useEffect(() => {
    if (!showTopMenu) return;
    const onDown = (e: MouseEvent) => { if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) setShowTopMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowTopMenu(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showTopMenu]);
  const [supabaseKey, setSupabaseKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const supabaseConnected = connResults.length > 0 && connResults.every((r) => r.ok) && connWrite.startsWith("✅");
  const maskedKey = supabaseKey ? `sb_publishable_••••••••${supabaseKey.slice(-4)}` : "sb_publishable_••••••••";
  const [authBusy, setAuthBusy] = useState(false);
  const [corruptedMember, setCorruptedMember] = useState<{ id: string; password: string } | null>(null);
  const [fixUsername, setFixUsername] = useState("");
  const [showFixUsername, setShowFixUsername] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [rooms, setRooms] = useState<RoomRec[]>([]);
  const [tables, setTables] = useState<TableRec[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [inGameTableId, setInGameTableId] = useState<string | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomMax, setNewRoomMax] = useState(6);
  const [showNewTable, setShowNewTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const seededRef = useRef(false);
  const roomsJsonRef = useRef("");
  const tablesJsonRef = useRef("");
  const latestTablesRef = useRef<TableRec[]>([]);
  const loadAll = useCallback(async () => {
    const [rData, tData] = await Promise.all([
      callRecords("records.list", { collection: "king-members-rooms" }),
      callRecords("records.list", { collection: "king-tables" }),
    ]) as [{ records?: { id: string; value?: unknown }[] }, { records?: { id: string; value?: unknown }[] }];
    const roomRecs: RoomRec[] = (Array.isArray(rData?.records) ? rData.records : []).filter((r) => (r?.value as { type?: string })?.type === "room").map((r) => ({ id: r.id, value: r.value as RoomRec["value"] }));
    const tableRecs: TableRec[] = (Array.isArray(tData?.records) ? tData.records : []).filter((r) => (r?.value as { type?: string })?.type === "table").map((r) => {
      const v = r.value as TableValue;
      // Sandalyelerde yalnızca username / displayName / ready / isBot tutulur;
      // eski kayıtlardaki password gibi alanlar bilerek atılır, ekrana çıkmaz.
      const seats = (v.seats || []).map((s, idx) => {
        if(!s) return null;
        const base = { id: (s as SeatValue).id, username: s.username, displayName: s.displayName || s.username, ready: s.ready, isBot: s.isBot } as SeatValue;
        // Normalize legacy seats whose username/displayName is a long internal
        // bot id (bot-1_<uuid>…): display as "Bot N" for that seat.
        if((base.username.startsWith("bot-") && base.username.length > 10) || (base.displayName.startsWith("bot-") && base.displayName.length > 10)){
          base.username = shortBotNameForSeat(idx); base.displayName = shortBotNameForSeat(idx);
        } else if(base.isBot && (!base.displayName || base.displayName.startsWith("bot-"))){
          base.displayName = shortBotNameForSeat(idx);
          if(base.username.startsWith("bot-")) base.username = base.displayName;
        }
        return base;
      });
      return { id: r.id, value: { ...v, seats } };
    });
    // Poll guard: never overwrite a newer optimistic local table with a
    // stale server echo (that made a played card disappear, then replay).
    const mergedTables: TableRec[] = tableRecs.map((server) => {
      const prev = latestTablesRef.current.find((p) => p.id === server.id);
      if (!prev) return server;
      if (prev.value.updatedAt > server.value.updatedAt) return prev;
      const prevCollected = prev.value.gameState?.collectedTrickIds ?? [];
      const serverTrick = server.value.gameState?.trick ?? [];
      if (prevCollected.length && serverTrick.length === 4 && server.value.gameState) {
        const tid = makeTrickId(server.value.gameState.round, server.value.gameState.trickNo, serverTrick);
        if (prevCollected.includes(tid)) return prev;
      }
      return server;
    });
    latestTablesRef.current = mergedTables;
    const rJson = JSON.stringify(roomRecs);
    const tJson = JSON.stringify(mergedTables);
    if (roomsJsonRef.current !== rJson) { roomsJsonRef.current = rJson; setRooms(roomRecs); }
    if (tablesJsonRef.current !== tJson) { tablesJsonRef.current = tJson; setTables(mergedTables); }
    return { roomRecs, tableRecs: mergedTables };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { roomRecs } = await loadAll();
        if (cancelled) return;
        if (!roomRecs.length && !seededRef.current) {
          seededRef.current = true;
          for (const dr of DEFAULT_ROOMS) {
            try { await callRecords("records.create", { collection: "king-members-rooms", value: { type: "room", name: dr.name, maxTables: dr.maxTables, createdBy: "KING", createdAt: Date.now() }, idempotency_key: `room-default-${dr.name}` }); } catch { /* already seeded */ }
          }
          await loadAll();
        }
      } catch { /* polling will retry */ }
    })();
    const iv = setInterval(() => { loadAll().catch(() => {}); }, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [loadAll]);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;
  const roomTables = selectedRoom ? tables.filter((t) => t.value.roomId === selectedRoom.id) : [];
  const inGameTable = inGameTableId ? tables.find((t) => t.id === inGameTableId && t.value.status === "playing" && t.value.gameState) : null;
  const mySeatIn = (t: TableValue) => t.seats.findIndex((s) => s && user && s.username === user.username);
  async function loadSummaries(){
    setSummariesLoading(true);
    try {
      const data = await callRecords("records.list", { collection: "king-tournament" }) as { records?: { id: string; value?: unknown }[] };
      const recs: SummaryRec[] = (Array.isArray(data?.records) ? data.records : []).filter((r) => (r?.value as { type?: string })?.type === "summary").map((r) => ({ id: r.id, value: r.value as GameSummaryValue }));
      recs.sort((a, b) => (b.value.createdAt || 0) - (a.value.createdAt || 0));
      setSummaries(recs);
    } catch (e) { setSummaryNotice(e instanceof Error ? e.message : "Özetler okunamadı."); } finally { setSummariesLoading(false); }
  }
  async function togglePinSummary(rec: SummaryRec){
    if (summaryBusy) return;
    setSummaryBusy(true); setSummaryNotice("");
    try {
      const next: GameSummaryValue = { ...rec.value, pinned: !rec.value.pinned };
      await callRecords("records.replace", { collection: "king-tournament", id: rec.id, value: next });
      setSummaries((prev) => prev.map((r) => r.id === rec.id ? { ...r, value: next } : r));
      setSummaryNotice(next.pinned ? "Özet tutuldu — toplu silmeden ve temizlikten korundu." : "Tut kaldırıldı.");
    } catch (e) { setSummaryNotice(e instanceof Error ? e.message : "Pin güncellenemedi."); } finally { setSummaryBusy(false); }
  }
  async function deleteSummary(rec: SummaryRec){
    if (summaryBusy) return;
    setSummaryBusy(true); setSummaryNotice("");
    try {
      await callRecords("records.delete", { collection: "king-tournament", id: rec.id });
      setSummaries((prev) => prev.filter((r) => r.id !== rec.id));
      setConfirmSummaryId(null);
      setSummaryNotice("Özet silindi.");
    } catch (e) { setSummaryNotice(e instanceof Error ? e.message : "Özet silinemedi."); } finally { setSummaryBusy(false); }
  }
  async function deleteAllUnpinnedSummaries(){
    if (summaryBusy) return;
    const targets = summaries.filter((r) => !r.value.pinned);
    if (!targets.length) { setSummaryNotice("Silinecek tutsuz özet yok."); setConfirmDeleteAll(false); return; }
    setSummaryBusy(true); setSummaryNotice("");
    let saved = 0; let error: string | null = null;
    try {
      for (const row of targets) { await callRecords("records.delete", { collection: "king-tournament", id: row.id }); saved += 1; }
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    let reloadError: string | null = null;
    try { await loadSummaries(); } catch (e) { reloadError = e instanceof Error ? e.message : String(e); }
    setSummaryNotice(error ? `Kısmi silme: ${saved} silindi, ${targets.length - saved} kaldı. Hata: ${error}${reloadError ? ` • Yenileme: ${reloadError}` : ""}` : `${saved} tutsuz özet silindi. Tutanlar korundu.`);
    setConfirmDeleteAll(false); setSummaryBusy(false);
  }
  async function testConnection(){
    setConnBusy(true); setConnResults([]); setConnWrite("");
    const checks: { label: string; collection: string }[] = [
      { label: "members", collection: "king-members" },
      { label: "rooms", collection: "king-members-rooms" },
      { label: "tables", collection: "king-tables" },
    ];
    const results: { label: string; ok: boolean; detail: string }[] = [];
    for(const c of checks){
      try {
        const data = await callRecords("records.list", { collection: c.collection }) as { records?: unknown[] };
        const n = Array.isArray(data?.records) ? data.records.length : 0;
        results.push({ label: c.label, ok: true, detail: `ok — ${n} kayıt okundu` });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        results.push({ label: c.label, ok: false, detail: raw });
      }
      setConnResults([...results]);
    }
    // Write probe: insert a throwaway test member, then delete it immediately.
    // If RLS / write permission blocks this, the write result shows it.
    const probe = `__baglanti_testi_${Date.now()}`;
    let createdId: string | null = null;
    try {
      const created = await callRecords("records.create", { collection: "king-members", value: { type: "member", username: probe, password: "__test__", displayName: "Bağlantı Testi", createdAt: Date.now() }, idempotency_key: `conn-test-${probe}` }) as { id?: string };
      createdId = typeof created?.id === "string" ? created.id : null;
      setConnWrite("✅ yazma ok — test üyesi yazıldı ve siliniyor…");
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setConnWrite(`❌ yazma engellendi: ${raw} — ${friendlyBackendError(raw, "register")}`);
    } finally {
      if(createdId){
        try { await callRecords("records.delete", { collection: "king-members", id: createdId }); setConnWrite("✅ yazma ok — test üyesi yazıldı ve silindi (RLS yazmayı engellemiyor)."); } catch (e) { setConnWrite(`⚠️ test üyesi yazıldı ama silinemedi: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    setConnBusy(false);
  }
  async function handleRegister(){
    // EXPLICIT FIELD MAPPING — never swap: usernameInput -> username,
    // passwordInput -> password. The password is never written into the
    // username / display_name column.
    const usernameInput = authUser.trim().toLowerCase();
    const passwordInput = authPass;
    const username = usernameInput;
    // Görünen ad, şifre alanındaki değerle aynıysa şifre sanılıp atılır.
    const displayRaw = (authName.trim() || authUser.trim()).slice(0, 14);
    const display = displayRaw && displayRaw !== passwordInput ? displayRaw : username;
    if(username === passwordInput){ setAuthError("Kullanıcı adı şifrenle aynı olamaz — farklı bir kullanıcı adı seç."); return; }
    if (username.length < 3) { setAuthError("Kullanıcı adı en az 3 karakter olmalı."); return; }
    if (!/^[a-z0-9._]+$/.test(username)) { setAuthError("Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir."); return; }
    if (authPass.length < 4) { setAuthError("Şifre en az 4 karakter olmalı."); return; }
    if (display.length < 2) { setAuthError("Görünen ad en az 2 harf olmalı."); return; }
    setAuthBusy(true); setAuthError(""); setAuthDetail(""); setOfferAutoRegister(false);
    // Demo fallback (only when the backend is unreachable): keep the session
    // usable locally, in memory only — nothing is claimed as saved.
    const demoRegister = () => {
      if (demoUsers.some((u) => u.username === username)) { setAuthError("Bu kullanıcı adı alınmış, başka dene"); setAuthBusy(false); return; }
      const next = [...demoUsers, { username, password: authPass, displayName: display }];
      setDemoUsers(next); setDemoMode(true);
      setUser({ username, displayName: display });
      setNotice(`Demo modunda giriş yaptın, ${username}! Bağlantı yokken bu oturum yalnızca bu sayfada geçerli.`);
      setAuthPass(""); setAuthName(""); setAuthBusy(false);
    };
    try {
      const data = await callRecords("records.list", { collection: "king-members" }) as { records?: { value?: { username?: string } }[] };
      const exists = (Array.isArray(data?.records) ? data.records : []).some((r) => String(r?.value?.username || "").toLowerCase() === username);
      if (exists) { setAuthError("Bu kullanıcı adı alınmış, başka dene"); return; }
      try {
        // username = usernameInput, password = passwordInput — explicit, never swapped.
        await callRecords("records.create", { collection: "king-members", value: { type: "member", username, password: passwordInput, displayName: display, createdAt: Date.now() }, idempotency_key: `member-${username}` });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        if (isConnectionError(raw)) { demoRegister(); return; }
        setAuthError(friendlyBackendError(raw, "register"));
        setAuthDetail(`Gerçek hata: ${raw}`);
        return;
      }
      setDemoMode(false);
      setUser({ username, displayName: display });
      setNotice(`Hoş geldin, ${username}!`);
      setAuthPass(""); setAuthName("");
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (isConnectionError(raw)) { demoRegister(); return; }
      setAuthError(friendlyBackendError(raw, "register"));
      setAuthDetail(`Gerçek hata: ${raw}`);
    } finally { setAuthBusy(false); }
  }
  async function handleLogin(){
    const username = authUser.trim().toLowerCase();
    if (!username || !authPass) { setAuthError("Kullanıcı adı ve şifre gerekli."); return; }
    setAuthBusy(true); setAuthError(""); setAuthDetail(""); setOfferAutoRegister(false);
    const demoLogin = () => {
      const found = demoUsers.find((u) => u.username === username);
      if (!found) { setAuthError("Önce Kayıt Ol yapman lazım"); setOfferAutoRegister(true); setAuthBusy(false); return; }
      if (found.password !== authPass) { setAuthError("Şifre hatalı."); setAuthBusy(false); return; }
      setDemoMode(true); setUser(safeUserFromMember({ username, displayName: found.displayName, password: found.password }));
      setNotice(`Demo modunda giriş yaptın, ${username}!`); setAuthPass(""); setAuthBusy(false);
    };
    try {
      const data = await callRecords("records.list", { collection: "king-members" }) as { records?: { id: string; value?: { username?: string; password?: string; displayName?: string } }[] };
      const found = (Array.isArray(data?.records) ? data.records : []).find((r) => String(r?.value?.username || "").toLowerCase() === username);
      if (!found?.value) { setAuthError("Önce Kayıt Ol yapman lazım"); setOfferAutoRegister(true); return; }
      if (found.value.password !== authPass) { setAuthError("Şifre hatalı — kullanıcı bulundu ama şifre uyuşmadı."); return; }
      // CORRUPTED ROW: the stored username IS the password (username === password).
      // Never log in showing the password as the name — prompt for a fix instead.
      if (String(found.value.username ?? "").trim() === authPass || (isAllDigits(String(found.value.username ?? "")) && isPasswordLikeUsername(String(found.value.username ?? ""), authPass))) {
        setCorruptedMember({ id: found.id, password: authPass });
        setFixUsername("");
        setAuthError("Kullanıcı adın şifrenle karışmış, lütfen tekrar kayıt ol veya yöneticiye bildir");
        setAuthDetail("Aşağıdaki “Kullanıcı Adını Düzelt” alanına doğru kullanıcı adını yaz (örn. onur).");
        return;
      }
      setDemoMode(false);
      // currentUser.username = row.username from the DB, NOT the password input.
      // Üye satırından yalnızca username / displayName alınır; password
      // currentUser'a asla konmaz. displayName şifreye eşitse kullanıcı adı kullanılır.
      setUser(safeUserFromMember(found.value));
      setNotice(`Tekrar hoş geldin, ${String(found.value.username ?? username)}!`);
      setAuthPass("");
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (isConnectionError(raw)) { demoLogin(); return; }
      setAuthError(friendlyBackendError(raw, "login"));
      setAuthDetail(`Gerçek hata: ${raw}`);
    } finally { setAuthBusy(false); }
  }
  async function fixCorruptedUsername(){
    const corrected = fixUsername.trim().toLowerCase();
    if (corrected.length < 3) { setAuthError("Düzeltilmiş kullanıcı adı en az 3 karakter olmalı."); return; }
    if (!/^[a-z0-9._]+$/.test(corrected)) { setAuthError("Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir."); return; }
    if (!corruptedMember) { setAuthError("Düzeltilecek bozuk kayıt bulunamadı."); return; }
    if (corrected === corruptedMember.password) { setAuthError("Düzeltilmiş kullanıcı adı şifrenle aynı olamaz."); return; }
    setFixBusy(true); setAuthError("");
    try {
      const data = await callRecords("records.list", { collection: "king-members" }) as { records?: { id: string; value?: { username?: string } }[] };
      const taken = (Array.isArray(data?.records) ? data.records : []).some((r) => r.id !== corruptedMember.id && String(r?.value?.username || "").toLowerCase() === corrected);
      if (taken) { setAuthError("Bu kullanıcı adı zaten alınmış, başka dene."); return; }
      await callRecords("records.replace", { collection: "king-members", id: corruptedMember.id, value: { type: "member", username: corrected, password: corruptedMember.password, displayName: corrected, createdAt: Date.now() } });
      setCorruptedMember(null);
      setUser({ username: corrected, displayName: corrected });
      setNotice(`Kullanıcı adın düzeltildi: ${corrected}`);
      setAuthPass(""); setFixUsername("");
    } catch (e) { setAuthError(e instanceof Error ? e.message : "Kullanıcı adı düzeltilemedi."); } finally { setFixBusy(false); }
  }
  async function fixCurrentUsername(){
    if (!user || !user.username) { setError("Önce giriş yapmalısın."); return; }
    const corrected = fixUsername.trim().toLowerCase();
    if (corrected.length < 3) { setError("Düzeltilmiş kullanıcı adı en az 3 karakter olmalı."); return; }
    if (!/^[a-z0-9._]+$/.test(corrected)) { setError("Kullanıcı adı yalnızca harf, rakam, nokta ve alt çizgi içerebilir."); return; }
    setFixBusy(true); setError("");
    try {
      const data = await callRecords("records.list", { collection: "king-members" }) as { records?: { id: string; value?: { username?: string; password?: string; displayName?: string; createdAt?: number } }[] };
      const found = (Array.isArray(data?.records) ? data.records : []).find((r) => String(r?.value?.username || "").toLowerCase() === user.username);
      if (!found?.value) { setError("Üye kaydı bulunamadı."); return; }
      const taken = (Array.isArray(data?.records) ? data.records : []).some((r) => r.id !== found.id && String(r?.value?.username || "").toLowerCase() === corrected);
      if (taken) { setError("Bu kullanıcı adı zaten alınmış, başka dene."); return; }
      await callRecords("records.replace", { collection: "king-members", id: found.id, value: { ...found.value, username: corrected, displayName: corrected } });
      setUser({ username: corrected, displayName: corrected });
      setShowFixUsername(false); setFixUsername("");
      setNotice(`Kullanıcı adın düzeltildi: ${corrected}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Kullanıcı adı düzeltilemedi."); } finally { setFixBusy(false); }
  }
  function logout(){ setUser(null); setDemoMode(false); setSelectedRoomId(null); setInGameTableId(null); setCorruptedMember(null); setShowFixUsername(false); setNotice("Çıkış yapıldı."); }
  async function createRoom(){
    if (!user) return;
    const name = newRoomName.trim().slice(0, 24);
    if (name.length < 3) { setError("Oda adı en az 3 harf olmalı."); return; }
    if (rooms.some((r) => r.value.name.toLowerCase() === name.toLowerCase())) { setError("Bu isimde bir oda zaten var."); return; }
    setBusy(true); setError("");
    try {
      await callRecords("records.create", { collection: "king-members-rooms", value: { type: "room", name, maxTables: Math.max(1, Math.min(12, newRoomMax)), createdBy: user.username, createdAt: Date.now() }, idempotency_key: `room-${name.toLowerCase()}-${Date.now()}` });
      setNewRoomName(""); setShowNewRoom(false); setNotice(`Oda kuruldu: ${name}`);
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Oda kurulamadı."); } finally { setBusy(false); }
  }
  async function createTable(){
    if (!user || !selectedRoom) return;
    if (roomTables.length >= selectedRoom.value.maxTables) { setError("Bu odada masa limiti doldu."); return; }
    let n = 1; const used = new Set(roomTables.map((t) => t.value.name));
    while (used.has(`Masa ${n}`)) n++;
    const name = (newTableName.trim() || `Masa ${n}`).slice(0, 24);
    if (used.has(name)) { setError("Bu isimde bir masa zaten var."); return; }
    setBusy(true); setError("");
    try {
      await callRecords("records.create", { collection: "king-tables", value: { type: "table", roomId: selectedRoom.id, roomName: selectedRoom.value.name, name, creator: user.username, status: "waiting", seats: [null, null, null, null], gameState: null, updatedAt: Date.now() }, idempotency_key: `table-${selectedRoom.id}-${name}-${Date.now()}` });
      setNewTableName(""); setShowNewTable(false); setNotice(`Masa kuruldu: ${name}`);
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Masa kurulamadı."); } finally { setBusy(false); }
  }
  async function sit(tableId: string, seatIdx: number){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId);
      if (!target) throw new Error("Masa bulunamadı.");
      if (target.value.status === "playing") throw new Error("Bu masa oyunda, oturamazsın.");
      if (target.value.seats[seatIdx]) throw new Error("Bu sandalye dolu.");
      for (const other of tableRecs) {
        if (other.value.roomId !== target.value.roomId || other.id === tableId) continue;
        const idx = other.value.seats.findIndex((s) => s && s.username === user.username);
        if (idx >= 0) {
          const seats = [...other.value.seats]; seats[idx] = null;
          await callRecords("records.replace", { collection: "king-tables", id: other.id, value: { ...other.value, seats, updatedAt: Date.now() } });
        }
      }
      const seats: (SeatValue | null)[] = [...target.value.seats];
      seats[seatIdx] = { username: user.username, displayName: user.displayName, ready: false, isBot: false };
      // Optimistic: sit instantly, sync in background.
      setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: { ...r.value, seats, updatedAt: Date.now() } } : r));
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      setNotice(`${target.value.name} — ${seatIdx + 1}. sandalyeye oturdun.`);
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Oturulamadı."); } finally { setBusy(false); }
  }
  async function stand(tableId: string){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId);
      if (!target) return;
      if (target.value.status === "playing") throw new Error("Oyun bitmeden masadan kalkamazsın — Ayrıl ile izlemeye geçebilirsin.");
      const idx = target.value.seats.findIndex((s) => s && s.username === user.username);
      if (idx < 0) return;
      const seats = [...target.value.seats]; seats[idx] = null;
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      setNotice("Masadan kalktın.");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Kalkılamadı."); } finally { setBusy(false); }
  }
  async function toggleReady(tableId: string){
    if (!user) return;
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId); if (!target) return;
      const idx = target.value.seats.findIndex((s) => s && s.username === user.username); if (idx < 0) return;
      const seats = [...target.value.seats];
      const cur = seats[idx]; if (!cur) return;
      seats[idx] = { ...cur, ready: !cur.ready };
      // Optimistic: ready state flips instantly.
      setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: { ...r.value, seats, updatedAt: Date.now() } } : r));
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Hazır durumu güncellenemedi."); }
  }
  async function addBot(tableId: string){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId); if (!target) throw new Error("Masa bulunamadı.");
      if (target.value.status === "playing") throw new Error("Bu masa oyunda, bot eklenemez.");
      if (!target.value.seats.some((s) => s && s.username === user.username)) throw new Error("Bot eklemek için masada oturmalısın.");
      const emptyIdx = target.value.seats.findIndex((s) => !s);
      if (emptyIdx < 0) throw new Error("Boş sandalye yok.");
      const used = new Set(target.value.seats.filter(Boolean).map((s) => s!.displayName));
      const botName = [emptyIdx + 1, 1, 2, 3].map((n) => `Bot ${n}`).find((n) => !used.has(n)) ?? `Bot ${emptyIdx + 1}`;
      const seats = [...target.value.seats];
      // Internal id stays internal; display uses the short username/displayName only.
      seats[emptyIdx] = { id: `bot-${emptyIdx + 1}-${Math.random().toString(36).slice(2, 10)}`, username: botName, displayName: botName, ready: true, isBot: true };
      // Stay on the same table view — no navigation — and show the bot instantly, then confirm via records.
      setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: { ...r.value, seats, updatedAt: Date.now() } } : r));
      setNotice(`${botName} masaya eklendi.`);
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Bot eklenemedi."); await loadAll().catch(() => {}); } finally { setBusy(false); }
  }
  async function removeBotAt(tableId: string, seatIdx: number){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId); if (!target) throw new Error("Masa bulunamadı.");
      if (target.value.status === "playing") throw new Error("Oyun bitmeden bot kaldırılamaz.");
      if (!target.value.seats.some((s) => s && s.username === user.username)) throw new Error("Bot kaldırmak için masada oturmalısın.");
      const seat = target.value.seats[seatIdx];
      if (!seat?.isBot) throw new Error("Bu sandalyede bot yok.");
      const seats = [...target.value.seats]; seats[seatIdx] = null;
      setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: { ...r.value, seats, updatedAt: Date.now() } } : r));
      setNotice(`${seat.displayName} masadan kaldırıldı.`);
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Bot kaldırılamadı."); await loadAll().catch(() => {}); } finally { setBusy(false); }
  }
  async function removeBots(tableId: string){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId); if (!target) throw new Error("Masa bulunamadı.");
      if (target.value.status === "playing") throw new Error("Oyun bitmeden bot kaldırılamaz.");
      if (!target.value.seats.some((s) => s && s.username === user.username)) throw new Error("Bot kaldırmak için masada oturmalısın.");
      const botCount = target.value.seats.filter((s) => s?.isBot).length;
      if (!botCount) { setNotice("Bu masada kaldırılacak bot yok."); return; }
      const seats = target.value.seats.map((s) => (s?.isBot ? null : s));
      setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: { ...r.value, seats, updatedAt: Date.now() } } : r));
      setNotice(`${botCount} bot masadan kaldırıldı.`);
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, seats, updatedAt: Date.now() } });
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Botlar kaldırılamadı."); await loadAll().catch(() => {}); } finally { setBusy(false); }
  }
  async function startTableGame(tableId: string){
    if (!user) return;
    setBusy(true); setError("");
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId); if (!target) throw new Error("Masa bulunamadı.");
      const filled = target.value.seats.filter(Boolean).length;
      if (filled !== 4) throw new Error("Başlamak için 4 sandalye dolu olmalı.");
      if (!target.value.seats.some((s) => s && s.username === user.username)) throw new Error("Başlamak için masada oturmalısın.");
      if (!target.value.seats.every((s) => s && s.ready)) throw new Error("Herkes Hazır olmalı.");
      const gs = dealFriendGame(null);
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, status: "playing", gameState: gs, updatedAt: Date.now() } });
      setInGameTableId(tableId);
      setNotice("Oyun başladı!");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Oyun başlatılamadı."); } finally { setBusy(false); }
  }
  async function saveTableGame(tableId: string, gs: FriendGameState){
    const target = tables.find((t) => t.id === tableId); if (!target) return;
    // Optimistic: show the card / round choice instantly, sync in background.
    const optimistic = { ...target.value, gameState: gs, updatedAt: Date.now() };
    latestTablesRef.current = latestTablesRef.current.map((r) => r.id === tableId ? { ...r, value: optimistic } : r);
    if (!latestTablesRef.current.some((r) => r.id === tableId)) latestTablesRef.current = [...latestTablesRef.current, { id: tableId, value: optimistic }];
    setTables((prev) => prev.map((r) => r.id === tableId ? { ...r, value: optimistic } : r));
    try {
      await callRecords("records.replace", { collection: "king-tables", id: tableId, value: optimistic });
    } catch (e) {
      setNotice("🔄 Tekrar deneniyor…");
      try { await new Promise((r) => setTimeout(r, 800)); await callRecords("records.replace", { collection: "king-tables", id: tableId, value: optimistic }); setNotice(""); }
      catch { setNotice("Tekrar deneniyor — bağlantı düzelince hamlen yeniden gönderilecek."); }
    }
    // No full refetch on every move: the 5s fallback poll only patches
    // changed tables via loadAll's JSON-diff check.
  }
  async function backToRoomTables(tableId: string){
    const target = tables.find((t) => t.id === tableId); if (!target) { setInGameTableId(null); return; }
    if (target.value.gameState) {
      const ok = await saveGameSummaryOnce(target.value, target.value.gameState.phase === "match-finished" ? "Bitti" : "Yarım Kaldı");
      if (!ok) setNotice("Özet kaydedilemedi.");
      else setNotice("Özet saklandı, masa detayı silindi.");
    }
    await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, status: "waiting", gameState: null, seats: target.value.seats.map((s) => s ? { ...s, ready: s.isBot } : null), updatedAt: Date.now() } });
    setInGameTableId(null);
    await loadAll();
  }
  async function newMatchAtTable(tableId: string){
    const target = tables.find((t) => t.id === tableId); if (!target) return;
    if (target.value.gameState && target.value.gameState.phase === "match-finished") {
      const ok = await saveGameSummaryOnce(target.value, "Bitti");
      if (!ok) setNotice("Önceki maçın özeti kaydedilemedi.");
      else setNotice("Önceki maçın özeti saklandı.");
    }
    const gs = dealFriendGame(null);
    await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, status: "playing", gameState: gs, updatedAt: Date.now() } });
    await loadAll();
  }
  // Close a table explicitly (creator): delete table + seats + game, back to tables list in the SAME room.
  async function closeTable(tableId: string){
    setBusy(true);
    try {
      const target = tables.find((t) => t.id === tableId);
      if (target?.gameState) {
        const ok = await saveGameSummaryOnce(target.value, target.value.gameState.phase === "match-finished" ? "Bitti" : "Yarım Kaldı");
        if (!ok) setNotice("Özet kaydedilemedi, detay yine de siliniyor.");
        else setNotice("Özet saklandı, masa detayı silindi.");
      }
      await callRecords("records.delete", { collection: "king-tables", id: tableId });
    } catch { /* delete locally anyway */ }
    setTables((prev) => prev.filter((t) => t.id !== tableId));
    setInGameTableId(null);
    setNotice("Masa kapatıldı.");
    try { await loadAll(); } catch { /* keep local state */ }
    setBusy(false);
  }
  // Leave the game: remove my seat. Only bots left -> delete the table. Real players remain -> waiting + bots cleared.
  async function leaveTableGame(tableId: string){
    if (!user) { setInGameTableId(null); return; }
    setBusy(true);
    try {
      const { tableRecs } = await loadAll();
      const target = tableRecs.find((t) => t.id === tableId);
      if (!target) { setInGameTableId(null); return; }
      if (target.value.gameState) {
        const ok = await saveGameSummaryOnce(target.value, target.value.gameState.phase === "match-finished" ? "Bitti" : "Yarım Kaldı");
        if (!ok) setNotice("Özet kaydedilemedi, masa detayı yine de siliniyor.");
        else setNotice("Özet saklandı (Yarım Kaldı / Bitti), masa detayı silindi.");
      }
      const remainingSeats = target.value.seats.map((s) => (s && s.username === user.username ? null : s));
      const realLeft = remainingSeats.filter((s) => s && !s.isBot).length;
      if (realLeft === 0) {
        try { await callRecords("records.delete", { collection: "king-tables", id: tableId }); } catch { /* delete locally */ }
        setTables((prev) => prev.filter((t) => t.id !== tableId));
        setNotice("Oyunu kapattın — masada sadece botlar kaldığı için masa da kapatıldı.");
      } else {
        const cleared = remainingSeats.map((s) => (s?.isBot ? null : s ? { ...s, ready: false } : null));
        await callRecords("records.replace", { collection: "king-tables", id: tableId, value: { ...target.value, status: "waiting", gameState: null, seats: cleared, updatedAt: Date.now() } });
        setNotice("Oyunu kapattın — masa beklemeye döndü, botlar temizlendi.");
      }
      setInGameTableId(null);
      await loadAll().catch(() => {});
    } catch { setInGameTableId(null); } finally { setBusy(false); }
  }
  // Orphan cleanup: a table with only bots and no real player is deleted on the next poll.
  useEffect(() => {
    const orphan = tables.find((t) => t.value.seats.some((s) => s?.isBot) && !t.value.seats.some((s) => s && !s.isBot));
    if (!orphan) return;
    const t = setTimeout(() => { callRecords("records.delete", { collection: "king-tables", id: orphan.id }).catch(() => {}); setTables((prev) => prev.filter((x) => x.id !== orphan.id)); }, 1500);
    return () => clearTimeout(t);
  }, [tables]);
  function chairButton(t: TableRec, seatIdx: number){
    const seat = t.value.seats[seatIdx];
    const isMine = !!seat && !!user && seat.username === user.username;
    const posLabel = ["Üst", "Sağ", "Alt", "Sol"][seatIdx];
    if (!seat) {
      const disabled = t.value.status === "playing" || !user || busy;
      return (
        <button key={seatIdx} disabled={disabled} onClick={() => sit(t.id, seatIdx)} aria-label={`${t.value.name} ${posLabel} sandalye — boş, otur`} className="chair chair-empty w-[64px] sm:w-[72px] rounded-xl px-1 py-1.5 text-center cursor-pointer hover:ring-2 hover:ring-[var(--gold)]">
          <span className="block text-[16px] leading-none" aria-hidden>🪑</span>
          <span className="block text-[9px] font-extrabold mt-0.5">Boş Sandalye</span>
          <span className="block text-[9px] font-black text-[#0f5b36]">OTUR ↓</span>
        </button>
      );
    }
    const seatedAtTable = mySeatIn(t.value) >= 0;
    const canRemoveBot = !!seat.isBot && seatedAtTable && t.value.status === "waiting";
    const clickable = isMine || canRemoveBot;
    const seatLabel = displayNameForSeatLike(seat, seatIdx);
    return (
      <button key={seatIdx} disabled={!clickable || busy} onClick={() => { if (canRemoveBot) removeBotAt(t.id, seatIdx); else if (isMine) stand(t.id); }} aria-label={`${t.value.name} ${posLabel} sandalye — ${seatLabel}${isMine ? ", senin sandalyen, kalkmak için tıkla" : canRemoveBot ? ", botu kaldırmak için tıkla" : ""}`} className={`chair w-[64px] sm:w-[72px] rounded-xl px-1 py-1.5 text-center ${isMine ? "chair-mine ring-2 ring-[var(--gold)] cursor-pointer" : canRemoveBot ? "cursor-pointer hover:ring-2 hover:ring-red-400" : "cursor-default"}`}>
        <span className="mx-auto w-6 h-6 rounded-full grid place-items-center text-[11px] font-black text-white" style={{ background: avatarColor(seatLabel) }} aria-hidden>{seatLabel.slice(0, 1).toUpperCase()}</span>
        <span className="block text-[10px] font-extrabold mt-0.5 truncate">{seatLabel}{seat.isBot ? " 🤖" : ""}</span>
        <span className={`block text-[9px] font-black ${seat.ready ? "text-emerald-700" : "text-[#7a1f2b]"}`}>{seat.ready ? "Hazır ✓" : "Bekliyor…"}</span>
        {isMine && <span className="block text-[9px] font-black text-[#7a1f2b]">KALK ↑</span>}
        {canRemoveBot && <span className="block text-[9px] font-black text-[#7a1f2b]">✕ Botu Kaldır</span>}
      </button>
    );
  }
  function renderTableCard(t: TableRec){
    const filled = t.value.seats.filter(Boolean).length;
    const mySeat = mySeatIn(t.value);
    const seated = mySeat >= 0;
    const botCount = t.value.seats.filter((s) => s?.isBot).length;
    const allReady = t.value.seats.every((s) => s && s.ready);
    const status = t.value.status === "playing" ? "Oyunda" : filled === 4 ? "Dolu" : `Bekliyor (${filled}/4)`;
    return (
      <article key={t.id} className="bg-white text-black rounded-3xl p-3 shadow-lg border border-[#CBD5E1]">
        <div className="flex flex-col items-center gap-1.5">
          {chairButton(t, 0)}
          <div className="flex items-center gap-1.5 w-full justify-center">
            {chairButton(t, 1)}
            <div className="felt rounded-[50%] w-[150px] h-[104px] sm:w-[170px] sm:h-[112px] grid place-items-center text-center px-3 shrink-0">
              <div>
                <p className="font-display font-black text-[16px] leading-tight text-white drop-shadow">{t.value.name}</p>
                <p className="text-[10px] font-extrabold text-[#FFE9A8] mt-0.5">{status}</p>
                <p className="text-[9px] font-bold text-white/85">{t.value.seats.filter(Boolean).map((s, si) => displayNameForSeatLike(s, si)).join(" • ") || "Henüz kimse oturmadı"}</p>
              </div>
            </div>
            {chairButton(t, 3)}
          </div>
          {chairButton(t, 2)}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
          {seated && t.value.status === "waiting" && (
            <button onClick={() => toggleReady(t.id)} className={`font-extrabold text-[11px] px-3 py-1.5 rounded-lg ${t.value.seats[mySeat]?.ready ? "bg-white border border-black/15" : "bg-[#059669] text-white"}`}>{t.value.seats[mySeat]?.ready ? "Hazır Değilim" : "Hazır Ol ✓"}</button>
          )}
          {seated && t.value.status === "waiting" && filled < 4 && (
            <button onClick={() => addBot(t.id)} disabled={busy} aria-label={`${t.value.name} masasına bot ekle — ${filled}/4 dolu`} className="bg-[var(--gold)] text-black border border-[#8a5322] font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1 shadow"><Plus size={14} /> ＋ Bot Ekle</button>
          )}
          {seated && t.value.status === "waiting" && botCount > 0 && (
            <button onClick={() => removeBots(t.id)} disabled={busy} className="bg-white border border-black/15 font-extrabold text-[11px] px-3 py-1.5 rounded-lg">Botları Kaldır ✕</button>
          )}
          {seated && t.value.status === "waiting" && (
            <button onClick={() => startTableGame(t.id)} disabled={busy || filled !== 4 || !allReady} className={`font-extrabold text-[11px] px-3 py-1.5 rounded-lg ${filled === 4 && allReady ? "bg-[#0f5b36] text-white" : "bg-black/10 text-black/40 cursor-not-allowed"}`}>BAŞLA ▶ {filled !== 4 ? `(${filled}/4 — ${4 - filled} sandalye kaldı)` : !allReady ? "(Herkes Hazır olmalı)" : ""}</button>
          )}
          {seated && t.value.status === "playing" && (
            <button onClick={() => setInGameTableId(t.id)} className="bg-[#0f5b36] text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg">Oyuna Dön ▶</button>
          )}
          {t.value.creator === user?.username && (
            <button onClick={() => closeTable(t.id)} disabled={busy} className="bg-red-600 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg">Masayı Kapat ✕</button>
          )}
          {!seated && t.value.status === "playing" && <span className="text-[11px] font-bold text-[#55645b]">Bu masa oyunda — boş sandalye yok, sadece izleyebilirsin.</span>}
          {!seated && t.value.status === "waiting" && <span className="text-[11px] font-bold text-[#55645b]">Bot eklemek için önce otur — boş bir sandalyeye tıkla.</span>}
        </div>
        {seated && t.value.status === "waiting" && filled < 4 && <p className="mt-1.5 text-center text-[10px] font-bold text-[#55645b]">Bot Ekle&apos;ye her basışında bir boş sandalyeye bir bot oturur. Masa dolunca (4/4) Bot Ekle gizlenir.</p>}
      </article>
    );
  }
  useEffect(() => { if (showAdminPanel && isAdmin) { void loadSummaries(); } }, [showAdminPanel, isAdmin]);
  const openSupabaseModal = () => { setShowTopMenu(false); setShowSupabaseModal(true); void testConnection(); };
  async function runAdminTest(){
    const stamp = new Date().toLocaleTimeString("tr-TR");
    setAdminLogs((p) => [`${stamp} — Bağlantı testi başlatıldı`, ...p].slice(0, 30));
    await testConnection();
    setAdminLogs((p) => [`${new Date().toLocaleTimeString("tr-TR")} — Bağlantı testi bitti`, ...p].slice(0, 30));
    try {
      const [m, r, t] = await Promise.all([callRecords("records.list", { collection: "king-members" }), callRecords("records.list", { collection: "king-members-rooms" }), callRecords("records.list", { collection: "king-tables" })]) as [{ records?: unknown[] }, { records?: unknown[] }, { records?: unknown[] }];
      setAdminCounts({ members: Array.isArray(m?.records) ? m.records.length : 0, rooms: Array.isArray(r?.records) ? r.records.length : 0, tables: Array.isArray(t?.records) ? t.records.length : 0 });
    } catch (e) { setAdminLogs((p) => [`Hata: ${e instanceof Error ? e.message : String(e)}`, ...p].slice(0, 30)); }
  }
  async function runAdminTestQuery(){
    const q = adminTestQuery.trim();
    if (!q) { setAdminTestResult("Önce bir test sorgusu yaz (ör. members)."); return; }
    const collection = q === "members" ? "king-members" : q === "rooms" ? "king-members-rooms" : q === "tables" ? "king-tables" : q;
    try {
      const data = await callRecords("records.list", { collection }) as { records?: unknown[] };
      const n = Array.isArray(data?.records) ? data.records.length : 0;
      setAdminTestResult(`Sorgu ok: ${collection} → ${n} kayıt okundu.`);
      setAdminLogs((p) => [`Sorgu: ${collection} → ${n} kayıt`, ...p].slice(0, 30));
    } catch (e) { setAdminTestResult(`Sorgu hatası: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const renderTopMenu = () => (
    <div className="ml-auto flex items-center gap-1.5">
      {isAdmin && (<button type="button" onClick={() => { setShowTopMenu(false); setShowAdminPanel(true); }} className="bg-[var(--gold)] text-black font-extrabold text-[12px] px-2.5 py-1 rounded-md h-[26px]">⚙️ Admin</button>)}
      <div ref={topMenuRef} className="relative">
        <button type="button" onClick={() => setShowTopMenu((v) => !v)} aria-label="Menü" aria-haspopup="menu" aria-expanded={showTopMenu} className="bg-white/10 border border-white/15 font-bold text-[14px] px-2.5 py-1 rounded-md h-[26px] leading-none">•••</button>
        {showTopMenu && (
          <div role="menu" aria-label="Menü" className="absolute right-0 top-[30px] z-50 w-[230px] bg-white text-black rounded-xl shadow-lg border border-black/10 p-1.5">
            {user ? (<button type="button" role="menuitem" onClick={() => { setShowTopMenu(false); setShowProfileModal(true); }} className="w-full text-left px-2 py-2 rounded-lg font-bold text-[12px] hover:bg-black/5">👤 Profil: {user.username}</button>) : (<button type="button" role="menuitem" onClick={() => { setShowTopMenu(false); setAuthMode("login"); }} className="w-full text-left px-2 py-2 rounded-lg font-bold text-[12px] hover:bg-black/5">👤 Profil: Giriş yapılmadı</button>)}
            {isAdmin && (<button type="button" role="menuitem" onClick={() => { setShowTopMenu(false); setShowAdminPanel(true); }} className="w-full text-left px-2 py-2 rounded-lg font-bold text-[12px] hover:bg-black/5">⚙️ Admin Paneli</button>)}
            <button type="button" role="menuitem" onClick={() => { setShowTopMenu(false); setInGameTableId(null); setSelectedRoomId(null); }} className="w-full text-left px-2 py-2 rounded-lg font-bold text-[12px] hover:bg-black/5">🏠 Odalara Dön</button>
            {user && (<button type="button" role="menuitem" onClick={() => { setShowTopMenu(false); setShowLogoutConfirm(true); }} className="w-full text-left px-2 py-2 rounded-lg font-bold text-[12px] text-red-700 hover:bg-red-50">🚪 Çıkış Yap</button>)}
          </div>
        )}
      </div>
    </div>
  );
  const siteModals = (
    <>
      {showProfileModal && (
        <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Profil" onClick={(e) => { if (e.target === e.currentTarget) setShowProfileModal(false); }}>
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[420px] p-4 sm:p-5 border border-[#CBD5E1]">
            <h2 className="font-display font-black text-[22px]">👤 Profil</h2>
            <p className="text-[13px] font-bold mt-2">Kullanıcı adı: {user ? user.username : "Giriş yapılmadı"}</p>
            <p className="text-[13px] font-bold mt-1">Görünen isim: {user ? (user.displayName || user.username) : "—"}</p>
            <p className="text-[12px] font-semibold text-[#55645b] mt-1">{demoMode ? "Demo modu — bu oturum yalnızca bu sayfada geçerli." : "Oturum açık — bu pencere oturumu kapatmaz."}</p>
            {user && (<button type="button" onClick={() => { setShowProfileModal(false); setInGameTableId(null); setSelectedRoomId(null); setShowFixUsername(true); setFixUsername(""); }} className="mt-3 w-full bg-white border border-black/15 font-extrabold py-2.5 rounded-xl">Kullanıcı Adını Düzelt</button>)}
            <button type="button" onClick={() => setShowProfileModal(false)} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl">Kapat</button>
          </div>
        </div>
      )}
      {showAdminPanel && isAdmin && (
        <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Admin Paneli" onClick={(e) => { if (e.target === e.currentTarget) setShowAdminPanel(false); }}>
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[600px] max-h-[86vh] overflow-y-auto p-4 sm:p-5 border border-[#CBD5E1]">
            <div className="flex items-start justify-between gap-2"><h2 className="font-display font-black text-[22px]">⚙️ Admin Paneli</h2><button type="button" onClick={() => setShowAdminPanel(false)} className="p-2 bg-black/5 rounded-full" aria-label="Admin panelini kapat"><X size={18} /></button></div>
            <p className="text-[12px] font-semibold text-[#55645b] mt-1">Yalnızca <b>onur</b> görür. Bağlantı durumu: {supabaseConnected ? "● Bağlı" : connResults.length ? "○ Bağlı değil" : "○ Henüz test edilmedi"}{connBusy ? " — test ediliyor…" : ""}</p>
            <div className="grid grid-cols-3 gap-2 mt-3">{[{ l: "Üyeler", v: adminCounts?.members }, { l: "Odalar", v: adminCounts?.rooms }, { l: "Masalar", v: adminCounts?.tables }].map((s) => (<div key={s.l} className="rounded-2xl border border-black/10 p-3 text-center"><div className="text-[11px] font-bold text-[#55645b]">{s.l}</div><div className="font-black text-[22px]">{s.v ?? "—"}</div></div>))}</div>
            {!!connResults.length && (<ul className="mt-3 grid gap-1.5">{connResults.map((r) => (<li key={r.label} className={`text-[12px] font-bold rounded-lg px-2.5 py-1.5 border ${r.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>{r.ok ? `✅ ${r.label} ok` : `❌ ${r.label}: ${r.detail}`}</li>))}</ul>)}
            {connWrite && <p className="mt-2 text-[12px] font-bold text-[#0f5b36] bg-[#ECFDF5] border border-emerald-200 rounded-lg px-2.5 py-1.5 break-words">{connWrite}</p>}
            <div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={() => void runAdminTest()} disabled={connBusy} className="bg-[#0f5b36] text-white font-extrabold py-2.5 px-3 rounded-xl disabled:opacity-60">{connBusy ? "Test ediliyor…" : "Bağlantıyı Test Et"}</button><button type="button" onClick={() => setShowAdminPanel(false)} className="bg-white border border-black/15 font-extrabold py-2.5 px-3 rounded-xl">Kapat</button></div>
            <div className="mt-4 border-t border-black/10 pt-3">
              <h3 className="font-extrabold text-[15px]">📜 Oyun Geçmişi / Özetler</h3>
              <p className="text-[11px] font-semibold text-[#55645b] mt-1">Masa kapanınca detay (eller, kartlar) silinir, yalnızca bu özet kalır. Özetler kart içermez. 📌 Tutulan özetler toplu silmeden ve temizlikten korunur.</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => void loadSummaries()} disabled={summariesLoading} className="bg-white border border-black/15 font-extrabold px-3 py-2 rounded-xl text-[12px] disabled:opacity-60">{summariesLoading ? "Yükleniyor…" : "Özetleri Yenile"}</button>
                <button type="button" onClick={() => setConfirmDeleteAll(true)} disabled={summaryBusy || !summaries.some((r) => !r.value.pinned)} className="bg-red-600 text-white font-extrabold px-3 py-2 rounded-xl text-[12px] disabled:opacity-60">Tümünü Sil <span className="font-bold opacity-80">(tutsuzlar)</span></button>
                <span className="text-[11px] font-bold text-[#55645b] self-center">{summaries.length} özet • {summaries.filter((r) => r.value.pinned).length} tutulan • {summaries.filter((r) => !r.value.pinned).length} tutsuz</span>
              </div>
              {summaryNotice && <p className="mt-2 text-[12px] font-bold text-[#0f5b36] bg-[#ECFDF5] border border-emerald-200 rounded-lg px-2.5 py-1.5 break-words">{summaryNotice}</p>}
              {confirmDeleteAll && (
                <div className="mt-2 border border-red-300 bg-red-50 rounded-xl p-3">
                  <p className="font-extrabold text-[13px]">Tutsuz {summaries.filter((r) => !r.value.pinned).length} özet silinsin mi?</p>
                  <p className="text-[11px] font-semibold text-[#55645b] mt-0.5">📌 Tutulan özetler silinmez.</p>
                  <div className="flex gap-2 mt-2"><button type="button" onClick={() => setConfirmDeleteAll(false)} className="flex-1 bg-white border border-black/15 font-extrabold py-2 rounded-xl text-[12px]">Vazgeç</button><button type="button" onClick={() => void deleteAllUnpinnedSummaries()} disabled={summaryBusy} className="flex-1 bg-red-600 text-white font-extrabold py-2 rounded-xl text-[12px] disabled:opacity-60">{summaryBusy ? "Siliniyor…" : "Evet, Tutsuzları Sil"}</button></div>
                </div>
              )}
              <div className="grid gap-2 mt-3 max-h-[320px] overflow-y-auto">
                {!summariesLoading && !summaries.length && <p className="text-[12px] font-semibold text-[#55645b]">Henüz özet yok — bir masa kapanınca özeti burada görünür.</p>}
                {summaries.map((rec) => {
                  const s = rec.value;
                  const age = summaryAgeDays(s);
                  const isOld = age > 30;
                  const isPinned = !!s.pinned;
                  return (
                    <div key={rec.id} className={`rounded-2xl border p-3 ${isPinned ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : isOld ? "border-amber-400 bg-amber-100" : "border-black/10 bg-white"}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-extrabold text-[12px]">{s.date}</span>
                        <span className="text-[11px] font-bold text-[#55645b]">{s.roomName} • {s.tableName} • {s.status}</span>
                        {isPinned && <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">📌 Tutuluyor</span>}
                        {isOld ? <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">30+ gün</span> : <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{age === 0 ? "Bugün" : `${age} gün önce`}</span>}
                      </div>
                      <p className="text-[12px] font-bold mt-1 break-words">{s.players.join(" • ")}</p>
                      <p className="text-[12px] font-semibold text-[#55645b] mt-0.5">Skor: {s.players.map((p, i) => `${p} ${s.finalScores[i] >= 0 ? `+${s.finalScores[i]}` : s.finalScores[i]}`).join(" • ")} • Kazanan: {s.winner} • {s.roundsPlayed} tur • {s.duration}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <button type="button" onClick={() => void togglePinSummary(rec)} disabled={summaryBusy} className={`font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg disabled:opacity-60 ${isPinned ? "bg-white border border-blue-400 text-blue-700" : "bg-blue-600 text-white"}`}>{isPinned ? "📌 Tutu Kaldır" : "📌 Tut"}</button>
                        {confirmSummaryId === rec.id ? (
                          <span className="flex gap-1.5"><button type="button" onClick={() => void deleteSummary(rec)} disabled={summaryBusy} className="bg-red-600 text-white font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg disabled:opacity-60">Evet, Sil</button><button type="button" onClick={() => setConfirmSummaryId(null)} className="bg-white border border-black/15 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg">Vazgeç</button></span>
                        ) : (
                          <button type="button" onClick={() => setConfirmSummaryId(rec.id)} disabled={summaryBusy} className="bg-white border border-red-300 text-red-700 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg disabled:opacity-60">🗑️ Sil</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="block mt-4 text-[12px] font-extrabold">Test Sorgusu (members / rooms / tables)</label>
            <div className="flex gap-2 mt-1"><input value={adminTestQuery} onChange={(e) => setAdminTestQuery(e.target.value)} placeholder="members" className="flex-1 border border-black/15 rounded-xl px-3 py-2.5 text-[13px] font-bold" aria-label="Test sorgusu" /><button type="button" onClick={() => void runAdminTestQuery()} className="bg-white border border-black/15 font-extrabold px-3 py-2.5 rounded-xl">Sorguyu Çalıştır</button></div>
            {adminTestResult && <p className="mt-2 text-[12px] font-bold text-[#0f5b36] bg-[#ECFDF5] border border-emerald-200 rounded-lg px-2.5 py-1.5 break-words">{adminTestResult}</p>}
            <h3 className="font-extrabold text-[13px] mt-4">Kayıtlar</h3>
            <div className="mt-1 max-h-[140px] overflow-y-auto rounded-xl border border-black/10 bg-[#F8FAFC] p-2 text-[11px] font-mono leading-snug">{adminLogs.length ? adminLogs.map((l, i) => (<p key={i} className="break-words">{l}</p>)) : <p className="text-[#55645b]">Henüz kayıt yok — Bağlantıyı Test Et ile başlat.</p>}</div>
            <label className="block mt-4 text-[12px] font-extrabold">Kurulum SQL&apos;i (seçip kopyalayabilirsiniz)</label>
            <textarea readOnly value={SUPABASE_SQL} rows={8} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2 text-[11px] font-mono bg-[#F8FAFC]" aria-label="Supabase kurulum SQL'i" />
          </div>
        </div>
      )}
      {showLogoutConfirm && user && (
        <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Çıkış onayı">
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[420px] p-4 sm:p-5 border border-[#CBD5E1]">
            <h2 className="font-display font-black text-[20px]">Çıkış yapmak istiyor musun?</h2>
            <p className="text-[12px] font-semibold text-[#55645b] mt-1">{user.username} olarak çıkış yapacaksın.</p>
            <div className="flex gap-2 mt-4"><button type="button" onClick={() => setShowLogoutConfirm(false)} className="flex-1 bg-white border border-black/15 font-extrabold py-3 rounded-xl">Vazgeç</button><button type="button" onClick={() => { setShowLogoutConfirm(false); logout(); }} className="flex-1 bg-red-600 text-white font-extrabold py-3 rounded-xl">Evet, Çıkış Yap</button></div>
          </div>
        </div>
      )}
    </>
  );
  if (inGameTable && user) {
    const t = inGameTable;
    const mySeat = mySeatIn(t.value);
    // Oyun görünümünde oyuncu adı = kullanıcı adı (sandalyenin username alanı).
    const players = t.value.seats.map((s, i) => ({ name: displayNameForSeatLike(s, i), seat: i, ready: s?.ready ?? false, isBot: s?.isBot ?? false }));
    const hostSeat = Math.max(0, t.value.seats.findIndex((s) => s && !s.isBot));
    const roomValue: RoomValue = { type: "room", code: t.value.roomName, host: players[hostSeat]?.name ?? "", hostSeat, players, status: "playing", gameState: t.value.gameState, updatedAt: t.value.updatedAt };
    return (
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
        <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
          <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
          <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
          <button onClick={() => setInGameTableId(null)} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md h-[26px]">◀ Masalara Dön</button>
          <span className="text-[11px] font-bold text-white/70 hidden sm:inline">{t.value.roomName} • {t.value.name}</span>
          <span className="flex items-center gap-1 text-[12px] font-bold"><span className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-black text-white" style={{ background: avatarColor(user.displayName || "Sen") }}>{(user.displayName || "Sen").slice(0, 1).toUpperCase()}</span>👤 {user.displayName || "Sen"}</span>
          {renderTopMenu()}
        </header>
        {siteModals}
        <main className="flex-1 min-h-0 flex flex-col w-full"><FriendsTable room={roomValue} mySeat={mySeat >= 0 ? mySeat : 0} isHost={mySeat === hostSeat} onSaveGame={(gs) => saveTableGame(t.id, gs)} onBackToLobby={() => backToRoomTables(t.id)} onNewMatch={() => newMatchAtTable(t.id)} onLeave={() => leaveTableGame(t.id)} onCloseTable={t.value.creator === user.username ? () => closeTable(t.id) : undefined} /></main>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
      <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
        <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
        <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
        {selectedRoom && <button onClick={() => { setSelectedRoomId(null); }} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md h-[26px]">◀ Odalara Dön</button>}
        {user ? (<span className="flex items-center gap-1 text-[12px] font-bold"><span className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-black text-white" style={{ background: avatarColor(user.displayName || "Sen") }}>{(user.displayName || "Sen").slice(0, 1).toUpperCase()}</span><span>👤 {user.displayName || "Sen"}</span></span>) : (<><button onClick={() => setAuthMode("login")} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md h-[26px]">Giriş Yap</button><button onClick={() => setAuthMode("register")} className="bg-[var(--gold)] text-black font-extrabold text-[12px] px-2.5 py-1 rounded-md h-[26px]">Kayıt Ol</button></>)}
        {renderTopMenu()}
      </header>
      {siteModals}
      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        {showFixUsername && user && (
          <div className="max-w-[520px] mx-auto mb-3 bg-white text-black rounded-2xl p-3 border border-amber-300">
            <p className="font-extrabold text-[13px]">Kullanıcı Adını Düzelt</p>
            <p className="text-[11px] font-semibold text-[#55645b] mt-1">Üye kaydındaki kullanıcı adını düzeltir. Şifren değiştirilmez.</p>
            <input value={fixUsername} onChange={(e) => setFixUsername(e.target.value)} placeholder="onur" maxLength={20} className="mt-2 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Doğru kullanıcı adı" />
            <div className="flex gap-2 mt-2"><button onClick={fixCurrentUsername} disabled={fixBusy} className="flex-1 bg-[#0f5b36] text-white font-extrabold py-2.5 rounded-xl disabled:opacity-60">{fixBusy ? "Düzeltiliyor…" : "Düzelt ▶"}</button><button onClick={() => setShowFixUsername(false)} className="bg-white border border-black/15 font-extrabold px-3 py-2.5 rounded-xl">Kapat</button></div>
            {error && <p className="mt-2 text-[12px] font-bold text-red-700">{error}</p>}
          </div>
        )}
        {!user ? (
          <div className="max-w-[520px] mx-auto">
            <form onSubmit={(e) => { e.preventDefault(); if (authMode === "login") void handleLogin(); else void handleRegister(); }} className="bg-white text-black rounded-3xl p-4 sm:p-5 shadow-lg border border-[#CBD5E1]">
              <h1 className="font-display font-black text-[26px] leading-tight">{authMode === "login" ? "Giriş Yap" : "Kayıt Ol"}</h1>
              <p className="text-[12px] font-semibold text-[#55645b] mt-1">Üyelikle odalara gir, masalara otur, arkadaşlarınla oyna. E-posta doğrulaması yok — kullanıcı adın ve şifren yeterli.</p>
              <div className="flex gap-1.5 mt-4">
                <button type="button" onClick={() => setAuthMode("login")} className={`flex-1 font-extrabold py-2.5 rounded-xl text-[13px] ${authMode === "login" ? "bg-[#0f5b36] text-white" : "bg-white border border-black/15"}`}>Giriş Yap</button>
                <button type="button" onClick={() => setAuthMode("register")} className={`flex-1 font-extrabold py-2.5 rounded-xl text-[13px] ${authMode === "register" ? "bg-[#0f5b36] text-white" : "bg-white border border-black/15"}`}>Kayıt Ol</button>
              </div>
              <label htmlFor="king-username" className="block mt-4 text-[12px] font-extrabold">Kullanıcı Adı</label>
              <input id="king-username" name="username" autoComplete="username" value={authUser} onChange={(e) => setAuthUser(e.target.value)} placeholder="örn. lara_07" maxLength={20} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Kullanıcı adı" />
              <label htmlFor="king-password" className="block mt-3 text-[12px] font-extrabold">Şifre</label>
              <input id="king-password" name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="En az 4 karakter" className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Şifre" />
              {authMode === "register" && (<><label htmlFor="king-display" className="block mt-3 text-[12px] font-extrabold">Görünen İsim</label><input id="king-display" name="displayName" autoComplete="nickname" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="örn. Lara" maxLength={14} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Görünen isim" /></>)}
              <p className="mt-2 text-[11px] font-semibold text-[#55645b]">Şifren hiçbir yerde gösterilmez — başlıkta ve masalarda yalnızca kullanıcı adın görünür.</p>
              {demoMode && <p className="mt-2 text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">Demo modu: bağlantı yokken bu oturum yalnızca bu sayfada geçerli, yenileyince silinir.</p>}
              {authError && <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert"><p className="text-[12px] font-bold text-red-700">{authError}</p>{authDetail && <p className="text-[11px] font-semibold text-red-800 mt-1 break-words">{authDetail}</p>}</div>}
              {corruptedMember && (
                <div className="mt-3 border border-amber-300 bg-amber-50 rounded-xl p-3">
                  <p className="font-extrabold text-[13px]">Kullanıcı Adını Düzelt</p>
                  <p className="text-[11px] font-semibold text-[#55645b] mt-1">Doğru kullanıcı adını yaz (örn. onur). Şifren bu alana yazılmaz ve ekranda gösterilmez.</p>
                  <label className="block mt-2 text-[12px] font-extrabold">Doğru Kullanıcı Adı</label>
                  <input value={fixUsername} onChange={(e) => setFixUsername(e.target.value)} placeholder="onur" maxLength={20} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Doğru kullanıcı adı" />
                  <button type="button" onClick={fixCorruptedUsername} disabled={fixBusy} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-2.5 rounded-xl disabled:opacity-60">{fixBusy ? "Düzeltiliyor…" : "Kullanıcı Adını Düzelt ▶"}</button>
                </div>
              )}
              {offerAutoRegister && (
                <button type="button" onClick={() => { setAuthMode("register"); setOfferAutoRegister(false); handleRegister(); }} disabled={authBusy} className="mt-2 w-full bg-white border-2 border-[#059669] text-[#0f5b36] font-extrabold py-2.5 rounded-xl">Bu bilgilerle Kayıt Ol ▶ (Otomatik Kayıt)</button>
              )}
              <button type="submit" disabled={authBusy} className="mt-4 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl disabled:opacity-60">{authBusy ? (authMode === "login" ? "Giriş yapılıyor…" : "Kayıt olunuyor…") : authMode === "login" ? "Giriş Yap ▶" : "Kayıt Ol ▶"}</button>
              <p className="text-[11px] font-semibold text-[#55645b] mt-2">Kayıt, e-posta doğrulaması kullanmaz — yalnızca kullanıcı adı + şifre yazılır.</p>
            </form>
            <button onClick={onBot} className="mt-3 w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-[12px] font-bold text-white">Üye olmadan oynamak istersen: Botlara Karşı Oyna 🤖</button>
          </div>
        ) : !selectedRoom ? (
          <div className="max-w-[760px] mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h1 className="font-display font-black text-[30px] leading-none">Odalar</h1><p className="text-[12px] font-semibold text-white/80 mt-1">Bir odaya gir, masaları gör, boş sandalyeye otur.</p></div>
              <button onClick={() => setShowNewRoom((v) => !v)} className="bg-[var(--gold)] text-black font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1"><Plus size={14} /> Yeni Oda Kur</button>
            </div>
            {showNewRoom && (
              <div className="mt-3 bg-white text-black rounded-2xl p-3 border border-[#CBD5E1]">
                <label className="block text-[12px] font-extrabold">Oda Adı</label>
                <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="örn. Sınıf Odası" maxLength={24} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Yeni oda adı" />
                <label className="block mt-2 text-[12px] font-extrabold">En fazla masa: {newRoomMax}</label>
                <input type="range" min={1} max={12} value={newRoomMax} onChange={(e) => setNewRoomMax(Number(e.target.value))} className="w-full" aria-label="En fazla masa" />
                <button onClick={createRoom} disabled={busy} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-2.5 rounded-xl disabled:opacity-60">Odayı Kur ▶</button>
              </div>
            )}
            {notice && <p className="mt-2 text-[12px] font-bold text-emerald-300">{notice}</p>}
            {error && <p className="mt-2 text-[12px] font-bold text-red-300">{error}</p>}
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              {rooms.map((r) => {
                const rt = tables.filter((t) => t.value.roomId === r.id);
                const inside = rt.flatMap((t) => t.value.seats.filter(Boolean).map((s, si) => displayNameForSeatLike(s, si)));
                const online = new Set(rt.flatMap((t) => t.value.seats.filter(Boolean).map((s, si) => displayNameForSeatLike(s, si)))).size;
                return (
                  <button key={r.id} onClick={() => { setSelectedRoomId(r.id); setError(""); setNotice(""); }} className="text-left bg-white text-black rounded-3xl p-4 shadow-lg border border-[#CBD5E1] hover:brightness-105">
                    <div className="flex items-center justify-between"><span className="font-display font-black text-[20px] leading-tight">{r.value.name}</span><span className="bg-[#0f5b36] text-white text-[11px] font-extrabold px-2 py-1 rounded-full">{online} çevrimiçi</span></div>
                    <p className="text-[12px] font-semibold text-[#55645b] mt-1">{rt.length}/{r.value.maxTables} masa • {inside.length} oyuncu içerde</p>
                    <p className="text-[11px] font-bold text-[#55645b] mt-1 truncate">{inside.length ? inside.join(", ") : "Henüz kimse yok — ilk sen gir."}</p>
                    <span className="inline-block mt-2 bg-[#0f5b36] text-white font-extrabold text-[12px] px-3 py-1.5 rounded-lg">Odaya Gir ▶</span>
                  </button>
                );
              })}
              {!rooms.length && <p className="text-[12px] font-bold text-white/80">Odalar yükleniyor…</p>}
            </div>
          </div>
        ) : (
          <div className="max-w-[900px] mx-auto">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setSelectedRoomId(null)} className="bg-white/10 border border-white/15 font-bold text-[12px] px-3 py-2 rounded-lg">◀ Odalara Dön</button>
              <h1 className="font-display font-black text-[26px] leading-none">{selectedRoom.value.name}</h1>
              <span className="text-[11px] font-bold text-white/80">{roomTables.length}/{selectedRoom.value.maxTables} masa</span>
              <button onClick={() => setShowNewTable((v) => !v)} className="ml-auto bg-[var(--gold)] text-black font-extrabold text-[12px] px-3 py-2 rounded-lg flex items-center gap-1"><Plus size={14} /> MASA KUR</button>
            </div>
            {showNewTable && (
              <div className="mt-3 bg-white text-black rounded-2xl p-3 border border-[#CBD5E1]">
                <label className="block text-[12px] font-extrabold">Masa Adı (boş bırakırsan otomatik: Masa 1, Masa 2…)</label>
                <input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="Masa 1" maxLength={24} className="mt-1 w-full border border-black/15 rounded-xl px-3 py-2.5 text-[14px] font-bold" aria-label="Masa adı" />
                <button onClick={createTable} disabled={busy} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-2.5 rounded-xl disabled:opacity-60">Masayı Kur ▶</button>
              </div>
            )}
            {notice && <p className="mt-2 text-[12px] font-bold text-emerald-300">{notice}</p>}
            {error && <p className="mt-2 text-[12px] font-bold text-red-300">{error}</p>}
            <p className="text-[11px] font-semibold text-white/75 mt-2">Masalar 2 saniyede bir yenilenir. Boş sandalyeye tıkla, otur. Kendi sandalyenine tekrar tıklarsan kalkarsın.</p>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {roomTables.map((t) => renderTableCard(t))}
              {!roomTables.length && <div className="bg-white/10 border border-white/15 rounded-2xl p-4 text-[12px] font-semibold text-white/85">Bu odada henüz masa yok — üstten MASA KUR ile ilk masayı kur.</div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
function BotGame({ onBack }: { onBack: () => void }){
  const { preset: speedPreset } = useGameSpeed();
  const [phase,setPhase] = useState<"setup"|"playing"|"finished"|"select-round">("setup");
  const [selectedRound,setSelectedRound] = useState<RoundType | null>(null);
  const [round,setRound] = useState<RoundType>("Kız Almaz");
  const [hands,setHands] = useState<CardT[][]>([[],[],[],[]]);
  const [trick,setTrick] = useState<{player:number;card:CardT}[]>([]);
  const [trickNo,setTrickNo] = useState(1);
  const [current,setCurrent] = useState(0);
  const [stats,setStats] = useState<Stats[]>([emptyStats(),emptyStats(),emptyStats(),emptyStats()]);
  const [takenCards,setTakenCards] = useState<CardT[][]>([[],[],[],[]]);
  const [lastRoundTaken,setLastRoundTaken] = useState<CardT[][] | null>(null);
  const [lastRoundScores,setLastRoundScores] = useState<number[] | null>(null);
  const [roundHistory,setRoundHistory] = useState<{ round: RoundType; scores: number[]; chooser: number }[]>([]);
  const [baseTotals,setBaseTotals] = useState<number[]>([0,0,0,0]);
  const [heartsBroken,setHeartsBroken] = useState(false);
  const [trumpBroken,setTrumpBroken] = useState(false);
  const [openedTrumpWithA,setOpenedTrumpWithA] = useState<boolean[]>([false,false,false,false]);
  const [earlyEnded,setEarlyEnded] = useState(false);
  const [heartsToast,setHeartsToast] = useState(false);
  const [lastWinner,setLastWinner] = useState<string>("");
  const [roundsPlayed,setRoundsPlayed] = useState(0);
  const [showScores,setShowScores] = useState(false);
  const [showHow,setShowHow] = useState(false);
  const [showFinal,setShowFinal] = useState(false);
  const [showScoreboard,setShowScoreboard] = useState(false);
  const [dealAfterReset,setDealAfterReset] = useState(false);
  const [roundToast,setRoundToast] = useState<string | null>(null);
  const [autoDealPending,setAutoDealPending] = useState(false);
  const [resolving,setResolving] = useState(false);
  const [message,setMessage] = useState("Maç başlamak için kartları dağıt.");
  const [persistError,setPersistError] = useState("");
  const [botThinking,setBotThinking] = useState(false);
  const [botPicked,setBotPicked] = useState<RoundType | null>(null);
  const [playedChoices,setPlayedChoices] = useState<RoundType[][]>([[],[],[],[]]);
  const [matchId,setMatchId] = useState<string>("");
  const [lastFinishedChooser,setLastFinishedChooser] = useState<number | null>(null);
  const [penaltyCounts,setPenaltyCounts] = useState<Record<RoundType, number>>(()=>({ "Kız Almaz":0, "Erkek Almaz":0, "Kupa Almaz":0, "Rıfkı":0, "El Almaz":0, "Son İki Almaz":0, "Koz-Maça":0, "Koz-Kupa":0, "Koz-Karo":0, "Koz-Sinek":0 } as Record<RoundType, number>));
  const [chooserOffset,setChooserOffset] = useState(0);
  const [sinek2Holder,setSinek2Holder] = useState<number | null>(null);
  const [skipCount,setSkipCount] = useState(0);
  const [modalPos,setModalPos] = useState<{x:number;y:number}|null>(null);
  const [isDraggingModal,setIsDraggingModal] = useState(false);
  const [isNarrow,setIsNarrow] = useState(()=> typeof window !== "undefined" ? window.innerWidth < 600 : false);
  const [collecting,setCollecting] = useState<{trick:{player:number;card:CardT}[]; winner:number}|null>(null);
  const [lastTwoTricks,setLastTwoTricks] = useState<{player:number; cards:CardT[]}[]>([]);
  const [winnerPreview,setWinnerPreview] = useState<{trick:{player:number;card:CardT}[]; winner:number}|null>(null);
  const [blockedInfo,setBlockedInfo] = useState<{ text: string; mustId: string | null; key: number } | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{dx:number;dy:number}|null>(null);

  const resolvingRef = useRef(false);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botTokenRef = useRef(0);
  const botChoiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchIdRef = useRef("");
  const roundKeyRef = useRef("");
  const finishedRoundKeyRef = useRef<string | null>(null);
  /* Bot watchdog: turn start + throttled attempts. Covers EVERY bot seat
     (1/2/3 — left, top, right) with the same code; after 2s without a move
     it auto-plays locally. A failed attempt is retried ~1s later, never
     permanently locked. */
  const botTurnStartRef = useRef(Date.now());
  const botWatchdogAttemptRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  const chooser = (roundsPlayed + chooserOffset) % 4;
  const fallbackAllowAnyTrump = skipCount >= 4;
  const isMatchComplete = roundsPlayed >= 20;
  const estimatedRoundScores = useMemo(()=> stats.map(s=>scoreFor(s,round)),[stats,round]);
  const displayTotals = baseTotals;
  const roundScores = lastRoundScores ?? estimatedRoundScores;
  const leadSuit = trick.length ? trick[0].card.suit : null;
  const playableIds = useMemo(()=>{
    if(phase!=="playing"||current!==0||resolving) return new Set<string>();
    return new Set(legalCards(hands[0], leadSuit, round, heartsBroken, trumpBroken, trick, openedTrumpWithA[0]).map(c=>c.id));
  },[hands,leadSuit,phase,current,resolving,round,heartsBroken,trumpBroken,trick,openedTrumpWithA]);
  const info = ROUNDS.find(r=>r.name===round)!;
  const remainingPenalty = useMemo(()=> penaltyRemaining(stats, round),[stats,round]);
  const isKozRound = !!trumpOf(round);
  const sequentialLeadCard = (()=>{
    if(phase!=="playing" || current!==0 || trick.length!==0 || !isKozRound) return null;
    // A-K-Q hint applies ONLY before trump is broken, ONLY when the
    // player holds the full trio. After trump is broken, no A-K-Q hint.
    // It also applies when the hand is only trump (e.g. only Sinek As +
    // Papaz left) — then As is still the required lead, and Papaz under
    // As is blocked, so the hint must not disappear in that case.
    if(trumpBroken) return null;
    const trump = trumpOf(round);
    if(!trump) return null;
    const hand0 = hands[0] || [];
    if(!hasTopTrump(hand0, trump)) return null;
    return requiredTrumpLead(hand0, trump);
  })();
  const committedLeadCard = (()=>{
    if(phase!=="playing" || current!==0 || trick.length!==0 || !isKozRound) return null;
    // Commitment hint ONLY after trump is broken, ONLY for the player
    // who opened trump with A, and ONLY about choosing trump.
    // Leading a side suit stays free, so this never forces trump.
    if(!trumpBroken) return null;
    if(!openedTrumpWithA[0]) return null;
    const trump = trumpOf(round);
    if(!trump) return null;
    return committedTrumpCard(hands[0] || [], trump);
  })();
  const handAnalysis = useMemo(()=> evaluateHand(hands[0] || []),[hands]);
  const displayHand0 = useMemo(()=> sortHumanHand(hands[0] || []),[hands]);

  const mustHint = useMemo(()=>{
    if(phase!=="playing"||current!==0||!trick.length) return "";
    // KUPA ALMAZ — zorunlu kupa atma ipucu (sadece eli takip ederken).
    if(round==="Kupa Almaz"){
      const lead = trick[0].card.suit;
      const hand = hands[0] || [];
      if(lead!=="Kupa" && !hand.some(c=>c.suit===lead) && hand.some(c=>c.suit==="Kupa")) return "Elinde açılan renk yok ve elinde kupa var — kupa atmak zorundasın!";
      return "";
    }
    // RIFKI — zorunlu kupa atma / muafiyet ipucu (sadece eli takip ederken).
    if(round==="Rıfkı"){
      const lead = trick[0].card.suit;
      const hand = hands[0] || [];
      if(lead!=="Kupa" && !hand.some(c=>c.suit===lead) && hand.some(c=>c.suit==="Kupa")){
        if(hand.some(c=>c.suit==="Kupa" && c.rank==="K")) return "Elinde Rıfkı var — Rıfkı'yı korumak için istediğin kartı atabilirsin.";
        return "Elinde açılan renk yok, elinde Rıfkı yok ve elinde kupa var — kupa atmak zorundasın!";
      }
      return "";
    }
    // ERKEK ALMAZ — zorunlu erkek atma ipucu (sadece eli takip ederken).
    // Muafiyet yok: Kupa Papazı da erkektir.
    if(round==="Erkek Almaz"){
      const lead = trick[0].card.suit;
      const hand = hands[0] || [];
      if(!hand.some(c=>c.suit===lead) && hand.some(c=>c.rank==="J" || c.rank==="K")) return "Elinde açılan renk yok ve elinde erkek var — erkek atmak zorundasın!";
      return "";
    }
    // KIZ ALMAZ — zorunlu kız atma ipucu (sadece eli takip ederken).
    if(round==="Kız Almaz"){
      const lead = trick[0].card.suit;
      const hand = hands[0] || [];
      if(!hand.some(c=>c.suit===lead) && hand.some(c=>c.rank==="Q")) return "Elinde açılan renk yok ve elinde kız var — kız atmak zorundasın!";
      return "";
    }
    const trump = trumpOf(round);
    if(!trump) return "";
    const lead = trick[0].card.suit;
    const hand = hands[0] || [];
    const hasLead = hand.some(c=>c.suit===lead);
    const trumpCards = hand.filter(c=>c.suit===trump);
    const playedTrumps = trick.filter(t=>t.card.suit===trump);
    if(lead===trump){
      if(!hasLead) return "";
      if(playedTrumps.length){
        const maxTrump = Math.max(...playedTrumps.map(t=>t.card.value));
        if(hand.some(c=>c.suit===trump && c.value>maxTrump)) return "Masada koz var ve elinde daha büyük koz var — büyüğünü atmak zorundasın!";
      }
      return "";
    }
    if(hasLead) return "";
    if(!trumpCards.length) return "";
    if(playedTrumps.length){
      const maxTrump = Math.max(...playedTrumps.map(t=>t.card.value));
      if(trumpCards.some(c=>c.value>maxTrump)) return "Masada koz var ve elinde daha büyük koz var — büyüğünü atmak zorundasın!";
    }
    return "Elinde açılan renk yok — koz atmak zorundasın!";
  },[phase,current,trick,round,hands]);

  function countsFor(player: number, played: RoundType[][] = playedChoices){
    const list = played[player] || [];
    const pen = list.filter(isPenaltyRoundType).length;
    const tru = list.filter(r=>!isPenaltyRoundType(r)).length;
    return { played: list.length, pen, tru, remPen: 3-pen, remTru: 2-tru };
  }
  function availableFor(player: number, played: RoundType[][] = playedChoices): RoundType[]{
    const list = played[player] || [];
    const c = countsFor(player, played);
    const out: RoundType[] = [];
    if(fallbackAllowAnyTrump){
      TRUMP_ROUNDS.forEach(r=>{ out.push(r); });
      return out;
    }
    PENALTY_ROUNDS.forEach(r=>{ if(!list.includes(r) && c.remPen>0 && (penaltyCounts[r] ?? 0) < 2) out.push(r); });
    TRUMP_ROUNDS.forEach(r=>{ if(c.remTru>0) out.push(r); });
    return out;
  }
  const globalPenaltyLine = PENALTY_ROUNDS.map(r=>`${SHORT_CODE[r]} ${penaltyCounts[r] ?? 0}/2${(penaltyCounts[r] ?? 0) >= 2 ? " Kapalı" : ""}`).join(", ");
  const chooserAvailable = availableFor(chooser);
  const chooserCounts = countsFor(chooser);
  const penaltyAvailable = chooserAvailable.filter(isPenaltyRoundType);
  const trumpAvailable = chooserAvailable.filter(r=>!isPenaltyRoundType(r));

  function hintFor(r: RoundType): string{
    if(r==="Kız Almaz") return handAnalysis.queens===0 ? "Elinde Kız yok — bu tur sana güvenli." : handAnalysis.queens>=3 ? `Elinde ${handAnalysis.queens} Kız var — bunu seçme, çok ceza yersin.` : `Elinde ${handAnalysis.queens} Kız var — dikkatli oyna.`;
    if(r==="Erkek Almaz") return handAnalysis.males===0 ? "Elinde Vale/Papaz yok — bu tur sana güvenli." : handAnalysis.males>=4 ? `Elinde ${handAnalysis.males} Vale/Papaz var — bunu seçme, çok ceza yersin.` : `Elinde ${handAnalysis.males} Vale/Papaz var — dikkatli oyna.`;
    if(r==="Kupa Almaz") return handAnalysis.hearts===0 ? "Elinde Kupa yok — bu tur sana güvenli." : handAnalysis.hearts>=6 ? `Elinde ${handAnalysis.hearts} Kupa var — bunu seçme, çok ceza yersin.` : `Elinde ${handAnalysis.hearts} Kupa var — kupalardan kaç.`;
    if(r==="Rıfkı") return handAnalysis.hasKingHearts ? "Kupa Papazı sende — bunu seçme, Papaz'ı elinden çıkarmaya çalış." : "Kupa Papazı sende değil — bu tur sana daha güvenli.";
    if(r==="El Almaz") return handAnalysis.highCards>=6 ? `Elinde ${handAnalysis.highCards} yüksek kart var — el almak zorunda kalabilirsin, bunu seçme.` : `Elinde ${handAnalysis.highCards} yüksek kart var — düşük kartlarla elden kaç.`;
    if(r==="Son İki Almaz") return handAnalysis.lowCards>=4 ? `Elinde ${handAnalysis.lowCards} düşük kart var — son iki elden kaçmak için iyi.` : `Elinde ${handAnalysis.lowCards} düşük kart var — son iki ele düşük kart sakla.`;
    const suit = r==="Koz-Maça" ? "Maça" : r==="Koz-Kupa" ? "Kupa" : r==="Koz-Karo" ? "Karo" : "Sinek";
    const s = handAnalysis.suits.find(x=>x.suit===suit)!;
    if(s.score>=10) return `${suit} kozun güçlü (${s.top.length? s.top.join(", ")+" var":""}) — bu koz turu sana uygun.`;
    if(s.score<=3) return `${suit} kozun zayıf (${s.count} kart) — bu koz turunu seçme, el toplayamazsın.`;
    return `${suit} kozun orta güçte (${s.count} kart${s.top.length? ", "+s.top.join(", "):""}) — dikkatli oyna.`;
  }
  const roundDisplayNames: Record<RoundType,string> = { "Kız Almaz":"Kız Almaz", "Erkek Almaz":"Erkek Almaz", "Kupa Almaz":"Kupa Almaz", "Rıfkı":"Rıfkı", "El Almaz":"El Almaz", "Son İki Almaz":"Son İki Almaz", "Koz-Maça":"Koz - Maça", "Koz-Kupa":"Koz - Kupa", "Koz-Karo":"Koz - Karo", "Koz-Sinek":"Koz - Sinek" };

  function onModalHandlePointerDown(e: React.PointerEvent<HTMLDivElement>){
    const el = modalRef.current;
    if(!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    if(modalPos===null) setModalPos({ x: rect.left, y: rect.top });
    setIsDraggingModal(true);
    try{ (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }catch{ /* pointer capture unavailable */ }
  }
  useEffect(()=>{
    if(!isDraggingModal) return;
    const onMove = (e: PointerEvent)=>{
      const drag = dragRef.current; const el = modalRef.current;
      if(!drag || !el) return;
      const rect = el.getBoundingClientRect();
      const minX = -rect.width + 140;
      const maxX = window.innerWidth - 140;
      const minY = 0;
      const maxY = Math.max(0, window.innerHeight - 84);
      setModalPos({ x: Math.min(maxX, Math.max(minX, e.clientX - drag.dx)), y: Math.min(maxY, Math.max(minY, e.clientY - drag.dy)) });
    };
    const onUp = ()=>{ dragRef.current = null; setIsDraggingModal(false); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return ()=>{ window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); };
  },[isDraggingModal]);

  function clearTimers(){
    if(resolveTimerRef.current){ clearTimeout(resolveTimerRef.current); resolveTimerRef.current = null; }
    if(collectTimerRef.current){ clearTimeout(collectTimerRef.current); collectTimerRef.current = null; }
    if(botTimerRef.current){ clearTimeout(botTimerRef.current); botTimerRef.current = null; }
    if(botChoiceTimerRef.current){ clearTimeout(botChoiceTimerRef.current); botChoiceTimerRef.current = null; }
    if(botRevealTimerRef.current){ clearTimeout(botRevealTimerRef.current); botRevealTimerRef.current = null; }
    botTokenRef.current += 1;
    resolvingRef.current = false;
    setResolving(false);
    setBotThinking(false);
    setCollecting(null);
    setWinnerPreview(null);
  }

  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      try{
        const data = await callRecords("records.list", { collection: "king-tournament" }) as { records?: { value?: { matchId?: string; chooser?: number; round?: RoundType; scores?: number[] } }[] } | null;
        if(cancelled || !data) return;
        const recs = Array.isArray(data.records) ? data.records : [];
        if(!recs.length) return;
        const lastMatchId = recs[recs.length-1]?.value?.matchId || "";
        if(!lastMatchId) return;
        const mine = recs.filter(r=>r?.value?.matchId===lastMatchId);
        const totals = [0,0,0,0];
        const played: RoundType[][] = [[],[],[],[]];
        mine.forEach(r=>{
          const v = r?.value; if(!v) return;
          if(Array.isArray(v.scores)) v.scores.forEach((s,i)=>{ if(i<4 && typeof s==="number") totals[i]+=s; });
          if(typeof v.chooser==="number" && v.chooser>=0 && v.chooser<4 && typeof v.round==="string") played[v.chooser].push(v.round as RoundType);
        });
        setBaseTotals(totals);
        setPlayedChoices(played);
        const loadedPenalty: Record<RoundType, number> = { "Kız Almaz":0, "Erkek Almaz":0, "Kupa Almaz":0, "Rıfkı":0, "El Almaz":0, "Son İki Almaz":0, "Koz-Maça":0, "Koz-Kupa":0, "Koz-Karo":0, "Koz-Sinek":0 } as Record<RoundType, number>;
        played.forEach(list=>list.forEach(r=>{ if(PENALTY_ROUNDS.includes(r)) loadedPenalty[r] = Math.min(2, (loadedPenalty[r] ?? 0) + 1); }));
        setPenaltyCounts(loadedPenalty);
        setRoundsPlayed(mine.length);
        setMatchId(lastMatchId);
        matchIdRef.current = lastMatchId;
        if(mine.length>=20) setShowFinal(true);
      }catch{
        if(!cancelled) setPersistError("Önceki maç skorları yüklenemedi; bu oturumdaki skorlar yerelde tutuluyor.");
      }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  function ensureMatchId(){
    if(matchIdRef.current) return matchIdRef.current;
    const id = `match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    matchIdRef.current = id;
    setMatchId(id);
    return id;
  }

  function dealForSelection(){
    clearTimers();
    setModalPos(null);
    setIsDraggingModal(false);
    setSkipCount(0);
    const mid = ensureMatchId();
    const deck = makeDeck();
    const h: CardT[][] = [[],[],[],[]];
    for(let i=0;i<52;i++) h[i%4].push(deck[i]);
    const sinekHolder = h.findIndex((hand)=>hand.some((c)=>c.suit==="Sinek" && c.rank==="2"));
    const isFirstRoundDeal = roundsPlayed===0;
    const effectiveChooser = isFirstRoundDeal && sinekHolder>=0 ? sinekHolder : chooser;
    if(isFirstRoundDeal){
      setSinek2Holder(sinekHolder>=0 ? sinekHolder : null);
      if(sinekHolder>=0) setChooserOffset(sinekHolder);
    } else {
      setSinek2Holder(null);
    }
    roundKeyRef.current = `${mid}-r${roundsPlayed}-c${effectiveChooser}-${Date.now()}`;
    finishedRoundKeyRef.current = null;
    const sorted = h.map((hand, idx)=> idx===0 ? sortHumanHand(hand) : sortHand(hand));
    setHands(sorted); setTrick([]); setTrickNo(1); setCurrent(-1);
    setHeartsBroken(false); setTrumpBroken(false); setOpenedTrumpWithA([false,false,false,false]); setEarlyEnded(false); setHeartsToast(false);
    setStats([emptyStats(),emptyStats(),emptyStats(),emptyStats()]);
    setTakenCards([[],[],[],[]]);
    setLastRoundTaken(null); setLastRoundScores(null);
    setLastTwoTricks([]);
    setPhase("select-round"); setLastWinner(""); setBotPicked(null);
    setSelectedRound(null);
    setMessage(isFirstRoundDeal && sinekHolder>=0 ? (sinekHolder===0 ? "Elini kontrol et ve listeden bir tur seç." : `${NAMES[sinekHolder]} seçiyor...`) : (chooser===0 ? "Elini kontrol et ve listeden bir tur seç." : `${NAMES[chooser]} eline bakıyor…`));
  }

  function confirmRound(nextRound: RoundType){
    if(phase!=="select-round") return;
    if(!availableFor(chooser).includes(nextRound)) return;
    if(PENALTY_ROUNDS.includes(nextRound)){
      setPenaltyCounts(prev=>({ ...prev, [nextRound]: Math.min(2, (prev[nextRound] ?? 0) + 1) }));
    }
    setSkipCount(0);
    setRound(nextRound);
    setBotThinking(false); setBotPicked(null);
    const leader = chooser;
    setPhase("playing"); setCurrent(leader);
    setMessage(`Seçilen Tur: ${nextRound} — ${leader===0 ? "Sıra sende, ilk eli sen açıyorsun." : `${NAMES[leader]} ilk eli açıyor.`}`);
  }

  function startSelected(){
    if(phase!=="select-round" || !selectedRound) return;
    confirmRound(selectedRound);
  }

  function randomPick(){
    if(phase!=="select-round" || chooser!==0) return;
    const avail = availableFor(chooser);
    if(!avail.length) return;
    const pick = avail[Math.floor(Math.random()*avail.length)];
    setSelectedRound(pick);
    setMessage(`Rastgele seçim: ${roundDisplayNames[pick]} — başlamak için BAŞLA'ya bas.`);
  }

  useEffect(()=>{
    if(phase!=="select-round" || isMatchComplete) return;
    if(!chooserAvailable.length){
      const t = setTimeout(()=>{ setChooserOffset(o=>o+1); setSkipCount(s=>s+1); setSelectedRound(null); setBotPicked(null); }, speedPreset.bot);
      return ()=>clearTimeout(t);
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase, chooser, roundsPlayed, chooserAvailable.length, skipCount]);

  useEffect(()=>{
    if(phase!=="select-round" || chooser===0 || isMatchComplete) return;
    setBotThinking(true); setBotPicked(null); setSelectedRound(null);
    if(botChoiceTimerRef.current) clearTimeout(botChoiceTimerRef.current);
    botChoiceTimerRef.current = setTimeout(()=>{
      const hand = hands[chooser] || [];
      const avail = availableFor(chooser);
      if(!avail.length) return;
      let best = avail[0]; let bestScore = -Infinity;
      avail.forEach(r=>{ const s = desirability(hand, r); if(s>bestScore){ bestScore=s; best=r; } });
      setBotPicked(best);
      setSelectedRound(best);
      setBotThinking(false);
      setMessage(`${NAMES[chooser]} seçti: ${roundDisplayNames[best]} ${isPenaltyRoundType(best)?"▲":"●"} — başlıyor…`);
      if(botRevealTimerRef.current) clearTimeout(botRevealTimerRef.current);
      botRevealTimerRef.current = setTimeout(()=>{ confirmRound(best); }, Math.max(400, Math.round(speedPreset.bot / 2)));
    }, speedPreset.bot);
    return ()=>{ if(botChoiceTimerRef.current) clearTimeout(botChoiceTimerRef.current); if(botRevealTimerRef.current) clearTimeout(botRevealTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase, chooser, roundsPlayed]);

  function startNewMatch(){
    clearTimers();
    setModalPos(null);
    setIsDraggingModal(false);
    const id = `match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    matchIdRef.current = id; setMatchId(id);
    finishedRoundKeyRef.current = null;
    setPlayedChoices([[],[],[],[]]);
    setPenaltyCounts({ "Kız Almaz":0, "Erkek Almaz":0, "Kupa Almaz":0, "Rıfkı":0, "El Almaz":0, "Son İki Almaz":0, "Koz-Maça":0, "Koz-Kupa":0, "Koz-Karo":0, "Koz-Sinek":0 } as Record<RoundType, number>);
    setChooserOffset(0);
    setSinek2Holder(null);
    setSkipCount(0);
    setBaseTotals([0,0,0,0]);
    setRoundsPlayed(0);
    setStats([emptyStats(),emptyStats(),emptyStats(),emptyStats()]);
    setTakenCards([[],[],[],[]]);
    setLastRoundTaken(null); setLastRoundScores(null);
    setRoundHistory([]);
    setSelectedRound(null); setBotPicked(null);
    setHands([[],[],[],[]]); setTrick([]); setTrickNo(1); setCurrent(-1);
    setPhase("setup"); setShowFinal(false); setLastFinishedChooser(null);
    setMessage("Yeni maç hazır. Kartları dağıt ve ilk seçimi sen yap.");
    setPersistError("");
  }

  function finishRound(finalStats: Stats[], finishedRound: RoundType, early=false, finalTaken: CardT[][] = takenCards){
    const key = roundKeyRef.current || `king-${Date.now()}`;
    if(finishedRoundKeyRef.current === key) return;
    finishedRoundKeyRef.current = key;
    const finalScores = finalStats.map((s,i)=>computeFinalRoundScore(s, finalTaken[i] || [], finishedRound));
    const finishedChooser = chooser;
    const nextPlayed = playedChoices.map((list,i)=> i===finishedChooser ? [...list, finishedRound] : [...list]);
    setPlayedChoices(nextPlayed);
    setLastFinishedChooser(finishedChooser);
    setLastRoundTaken(finalTaken);
    setLastRoundScores(finalScores);
    setRoundHistory(prev=>[...prev, { round: finishedRound, scores: finalScores, chooser: finishedChooser }]);
    setBaseTotals(prev=>prev.map((t,i)=>t+finalScores[i]));
    setRoundsPlayed(p=>p+1);
    setPhase("finished");
    const best = finalScores.indexOf(Math.max(...finalScores));
    if(early) setMessage(`Ceza bitti! Tur erken sona erdi. Bu turu ${NAMES[best]} kazandı.`);
    else setMessage(`Tur bitti. Bu turu ${NAMES[best]} kazandı.`);
    if(roundsPlayed+1>=20){
      setTimeout(()=> setShowFinal(false), 0);
    } else {
      setRoundToast(`Tur bitti — ${roundDisplayNames[finishedRound]} — Bu tur: ${NAMES.map((n,i)=>`${n} ${finalScores[i]>=0?`+${finalScores[i]}`:finalScores[i]}`).join(", ")} — Yeni tur başlıyor…`);
      setAutoDealPending(true);
    }
    (async()=>{
      try{
        await callRecords("records.create", { collection: "king-tournament", value: { matchId: matchIdRef.current || ensureMatchId(), chooser: finishedChooser, round: finishedRound, scores: finalScores }, idempotency_key: roundKeyRef.current || `king-${Date.now()}` });
        setPersistError("");
      }catch{
        setPersistError("Bu tur skoru kaydedilemedi; sayfayı yenilersen bu tur toplamdan düşebilir.");
      }
    })();
  }

  function resolveTrick(finalTrick: {player:number;card:CardT}[], statsSnapshot: Stats[], trickNoSnapshot: number, roundSnapshot: RoundType, takenSnapshot: CardT[][]){
    if(resolvingRef.current) return;
    resolvingRef.current = true;
    setResolving(true);
    setCurrent(-1);
    const trump = trumpOf(roundSnapshot);
    const winner = trickWinner(finalTrick, finalTrick[0].card.suit, trump);
    // 1-second pause: keep all 4 cards (including the last played card) fully
    // visible in the center, show only the winner hint, do NOT move cards yet.
    setWinnerPreview({ trick: finalTrick, winner });
    setLastWinner(`${NAMES[winner]} bu eli kazandı`);
    if(resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = setTimeout(()=>{
      resolveTimerRef.current = null;
      // After exactly 1000ms, start the collect animation.
      setWinnerPreview(null);
      setCollecting({ trick: finalTrick, winner });
      setTrick([]);
      if(collectTimerRef.current) clearTimeout(collectTimerRef.current);
      collectTimerRef.current = setTimeout(()=>{
        collectTimerRef.current = null;
        setCollecting(null);
      const ns = statsSnapshot.map(s=>({...s}));
      ns[winner].tricks += 1;
      finalTrick.forEach(({card})=>{
        if(card.rank==="Q") ns[winner].queens += 1;
        if(card.rank==="J"||card.rank==="K") ns[winner].male += 1;
        if(card.suit==="Kupa") ns[winner].hearts += 1;
        if(card.suit==="Kupa"&&card.rank==="K") ns[winner].rifki += 1;
      });
      if(trickNoSnapshot===12||trickNoSnapshot===13) ns[winner].sonIki += 1;
      const ntaken = takenSnapshot.map(arr=>[...arr]);
      ntaken[winner] = [...ntaken[winner], ...finalTrick.map(t=>t.card)];
      setTakenCards(ntaken);
      setLastTwoTricks(prev=>[...prev, { player: winner, cards: finalTrick.map(t=>t.card) }].slice(-2));
      setStats(ns);
      resolvingRef.current = false;
      setResolving(false);
      if(earlyEndReached(ns, roundSnapshot)){
        setEarlyEnded(true);
        setTrick([]);
        finishRound(ns, roundSnapshot, true, ntaken);
        return;
      }
      if(trickNoSnapshot===13){
        setTrick([]);
        finishRound(ns, roundSnapshot, false, ntaken);
      } else {
        setTrick([]); setTrickNo(trickNoSnapshot+1); setCurrent(winner);
        setMessage(winner===0 ? "Eli kazandın, sıra sende." : `${NAMES[winner]} eli kazandı, sırayı o açıyor.`);
      }
      }, speedPreset.collection);
    }, speedPreset.card);
  }

  function playCard(player:number, card:CardT){
    if(phase!=="playing"||resolvingRef.current) return;
    if(player===0 && current!==0) return;
    if(player!==0 && current!==player) return;
    if(player===0 && !playableIds.has(card.id)) return;
    if(trick.length>0){
      const legalFollow = legalCards(hands[player], leadSuit, round, heartsBroken, trumpBroken, trick);
      if(!legalFollow.some(c=>c.id===card.id)) return;
    }
    if(!trick.length){
      const legalLead = legalCards(hands[player], null, round, heartsBroken, trumpBroken, trick, openedTrumpWithA[player]);
      if(!legalLead.some(c=>c.id===card.id)) return;
    }
    if(!trick.length && (round==="Kupa Almaz"||round==="Rıfkı") && !heartsBroken && card.suit==="Kupa" && hands[player].some(c=>c.suit!=="Kupa")) return;
    if(!trick.length){
      const trump = trumpOf(round);
      if(trump && !trumpBroken && card.suit===trump){
        // Choosing to lead trump before it is broken: must follow
        // A-K-Q order. With a side-suit choice, the full trio is
        // required and only the next trio card (A first) may be led.
        const onlyTrump = hands[player].length>0 && hands[player].every(c=>c.suit===trump);
        const required = requiredTrumpLead(hands[player], trump);
        if(onlyTrump){
          if(required && required.id!==card.id) return;
        } else {
          if(!hasTopTrump(hands[player], trump)) return;
          if(!required || required.id!==card.id) return;
        }
      }
    }
    const onlyHearts = hands[player].length>0 && hands[player].every(c=>c.suit==="Kupa");
    const breaksHearts = card.suit==="Kupa" && ((trick.length===0 && onlyHearts) || (trick.length>0 && leadSuit!=="Kupa"));
    if(breaksHearts && !heartsBroken && (round==="Kupa Almaz"||round==="Rıfkı")) setHeartsBroken(true);
    const trumpNow = trumpOf(round);
    // Leading trump breaks trump (so the conditional A-K-Q rule ends),
    // as does following with trump when void in the led suit.
    const breaksTrump = !!trumpNow && card.suit===trumpNow && (trick.length===0 || (trick.length>0 && leadSuit!==trumpNow));
    if(breaksTrump && !trumpBroken) setTrumpBroken(true);
    // Commitment is set ONLY when THIS player leads Trump A while
    // trump is still closed (opening / breaking trump with A).
    // Breaking with a non-A trump, or trump broken by someone else,
    // commits nobody. Following with A does not commit either.
    if(!trick.length && trumpNow && !trumpBroken && card.suit===trumpNow && card.rank==="A"){
      setOpenedTrumpWithA(prev=>prev.map((v,i)=> i===player ? true : v));
    }
    if(trick.some(t=>t.player===player)) return;
    if(!hands[player].some(c=>c.id===card.id)) return;
    setHands(prev=>prev.map((h,i)=> i===player ? h.filter(c=>c.id!==card.id) : h));
    const nt = [...trick,{player,card}];
    setTrick(nt);
    if(nt.length<4){
      setCurrent((player+1)%4);
    } else {
      setCurrent(-1);
      resolveTrick(nt, stats, trickNo, round, takenCards);
    }
  }

  useEffect(()=>{ if(!blockedInfo) return; const t = setTimeout(()=>setBlockedInfo(null), 4000); return ()=>clearTimeout(t); },[blockedInfo]);
  function handleHumanCardClick(card: CardT){
    console.log("[card-click]", card.id, card.suit, card.rank, "playable:", playableIds.has(card.id), "lead:", trick.length ? trick[0].card.suit : null, "trump:", trumpOf(round));
    if(phase!=="playing" || current!==0 || resolving) return;
    if(playableIds.has(card.id)){ playCard(0, card); return; }
    const explained = explainBlockedCard(hands[0] || [], trick, round, heartsBroken, trumpBroken, openedTrumpWithA[0], card);
    setBlockedInfo({ text: explained?.reason ?? "Bu kart bu elde oynanamaz.", mustId: explained?.mustCard?.id ?? null, key: Date.now() });
  }
  function blockedReasonFor(card: CardT){
    if(phase!=="playing" || current!==0 || playableIds.has(card.id)) return "";
    return explainBlockedCard(hands[0] || [], trick, round, heartsBroken, trumpBroken, openedTrumpWithA[0], card)?.reason ?? "";
  }
  useEffect(()=>{ botTurnStartRef.current = Date.now(); botWatchdogAttemptRef.current = { key: "", at: 0 }; },[phase, current, trick.length, trickNo, chooser, round]);
  useEffect(()=>{
    if(phase!=="playing" && phase!=="select-round") return;
    const iv = setInterval(()=>{
      if(Date.now() - botTurnStartRef.current < 2000) return;
      if(phase==="select-round"){
        if(chooser===0 || isMatchComplete) return;
        const key = `select-${roundsPlayed}-${chooser}`;
        if(botWatchdogAttemptRef.current.key===key && Date.now()-botWatchdogAttemptRef.current.at<1000) return;
        botWatchdogAttemptRef.current = { key, at: Date.now() };
        const avail = availableFor(chooser);
        if(!avail.length){ setChooserOffset(o=>o+1); setSkipCount(s=>s+1); return; }
        const hand = hands[chooser] || [];
        let best = avail[0]; let bestScore = -Infinity;
        avail.forEach(r=>{ const s = desirability(hand, r); if(s>bestScore){ bestScore=s; best=r; } });
        setBotPicked(best); setSelectedRound(best); confirmRound(best);
        return;
      }
      if(resolvingRef.current || current===-1 || current===0 || trick.length>=4) return;
      const key = `play-${round}-${trickNo}-${current}-${trick.map(t=>t.card.id).join(",")}`;
      if(botWatchdogAttemptRef.current.key===key && Date.now()-botWatchdogAttemptRef.current.at<1000) return;
      botWatchdogAttemptRef.current = { key, at: Date.now() };
      const hand = hands[current] || [];
      if(!hand.length || trick.some(t=>t.player===current)){ setCurrent((current+1)%4); return; }
      const playedSoFar = [...takenCards.flat(), ...trick.map(t=>t.card)];
      const c = chooseBot(hand, trick, round, trickNo, heartsBroken, trumpBroken, playedSoFar, openedTrumpWithA[current]);
      if(!c){ setCurrent((current+1)%4); return; }
      playCard(current, c);
    }, 250);
    return ()=>clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase, current, trick, hands, round, trickNo, heartsBroken, trumpBroken, openedTrumpWithA, chooser, roundsPlayed]);
  useEffect(()=>{
    if(phase!=="playing"||trick.length!==4||resolvingRef.current) return;
    resolveTrick(trick, stats, trickNo, round, takenCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[trick, phase]);

  useEffect(()=>{
    if(phase!=="playing") return;
    if(current===-1||current===0||trick.length>=4) return;
    if(resolvingRef.current) return;
    const token = ++botTokenRef.current;
    if(botTimerRef.current) clearTimeout(botTimerRef.current);
    botTimerRef.current = setTimeout(()=>{
      if(token !== botTokenRef.current) return;
      if(resolvingRef.current) return;
      const hand = hands[current];
      // Same rule as the watchdog, for every seat including the left bot:
      // an empty hand (or a stale turn pointer) must skip, never stall.
      if(!hand.length || trick.some(t=>t.player===current)){ setCurrent((current+1)%4); return; }
      const playedSoFar = [...takenCards.flat(), ...trick.map(t=>t.card)];
      const c = chooseBot(hand, trick, round, trickNo, heartsBroken, trumpBroken, playedSoFar, openedTrumpWithA[current]);
      if(c) playCard(current, c);
    }, speedPreset.bot);
    return ()=>{ if(botTimerRef.current){ clearTimeout(botTimerRef.current); botTimerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,current,trick,hands,round,trickNo,heartsBroken,trumpBroken,openedTrumpWithA]);

  useEffect(()=>()=>{ if(resolveTimerRef.current) clearTimeout(resolveTimerRef.current); if(collectTimerRef.current) clearTimeout(collectTimerRef.current); if(botTimerRef.current) clearTimeout(botTimerRef.current); if(botChoiceTimerRef.current) clearTimeout(botChoiceTimerRef.current); if(botRevealTimerRef.current) clearTimeout(botRevealTimerRef.current); },[]);

  useEffect(()=>{
    if(dealAfterReset && phase==="setup"){
      setDealAfterReset(false);
      dealForSelection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dealAfterReset, phase]);

  useEffect(()=>{
    if(!heartsBroken) return;
    if(round!=="Kupa Almaz" && round!=="Rıfkı") return;
    setHeartsToast(true);
    setMessage("Kupa açıldı! Artık kupa ile başlanabilir.");
    const t = setTimeout(()=>setHeartsToast(false), 3200);
    return ()=>clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[heartsBroken]);

  useEffect(()=>{
    if(!roundToast) return;
    const t = setTimeout(()=>setRoundToast(null), 2000);
    return ()=>clearTimeout(t);
  },[roundToast]);

  useEffect(()=>{
    if(!autoDealPending) return;
    setAutoDealPending(false);
    dealForSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoDealPending]);

  /* No "Takıldıysa Devam Et" / "Sıfırla" fallback button: the bot effect
     + the 2s watchdog above self-heal the game, so no manual resume
     control exists anywhere in this game. */

  function breakdown(s: Stats, r: RoundType){
    if(r==="Kız Almaz") return `${s.queens} Kız aldı • ${s.queens} × −100`;
    if(r==="Erkek Almaz") return `${s.male} Vale / Papaz aldı • ${s.male} × −60`;
    if(r==="Kupa Almaz") return `${s.hearts} Kupa aldı • ${s.hearts} × −30`;
    if(r==="Rıfkı") return s.rifki ? "Kupa Papazı'nı aldı • −320" : "Kupa Papazı'nı almadı • 0";
    if(r==="El Almaz") return `${s.tricks} el kazandı • ${s.tricks} × −50`;
    if(r==="Son İki Almaz") return `${s.sonIki} son el kazandı • ${s.sonIki} × −180`;
    return `${s.tricks} el kazandı • ${s.tricks} × +50`;
  }
  function verificationLine(player: number, r: RoundType): string{
    const taken = (lastRoundTaken?.[player] || takenCards[player] || []);
    const pen = penaltyCardsFor(taken, r);
    if(r==="Kız Almaz") return `Aldığın Kız: ${pen.length} × −100 = ${pen.length*-100}`;
    if(r==="Erkek Almaz") return `Aldığın Vale / Papaz: ${pen.length} × −60 = ${pen.length*-60}`;
    if(r==="Kupa Almaz") return `Aldığın Kupa: ${pen.length} × −30 = ${pen.length*-30}`;
    if(r==="Rıfkı") return pen.length ? "Aldığın Kupa Papazı: 1 × −320 = −320" : "Aldığın Kupa Papazı: 0 × −320 = 0";
    if(r==="El Almaz") return `Kazandığın El: ${stats[player].tricks} × −50 = ${stats[player].tricks*-50}`;
    if(r==="Son İki Almaz") return `Kazandığın Son El: ${stats[player].sonIki} × −180 = ${stats[player].sonIki*-180}`;
    return `Kazandığın El: ${stats[player].tricks} × +50 = ${stats[player].tricks*50}`;
  }
  function remainingLabel(){
    if(phase==="setup") return null;
    if(round==="Kız Almaz") return `Kalan Kız: ${remainingPenalty}/4`;
    if(round==="Erkek Almaz") return `Kalan Erkek: ${remainingPenalty}/8`;
    if(round==="Kupa Almaz") return `Kalan Kupa: ${remainingPenalty}/13`;
    if(round==="Rıfkı") return remainingPenalty===0 ? "Rıfkı: Yenildi" : "Rıfkı: Oyunda";
    return null;
  }
  const finalOrder = [...NAMES.map((_,i)=>i)].sort((a,b)=> baseTotals[b]-baseTotals[a]);
  const nextChooser = (roundsPlayed + chooserOffset) % 4;
  const displayChooser = phase==="finished" ? (lastFinishedChooser ?? chooser) : chooser;
  const gameBadgeRound = phase==="select-round" ? "Tur Seçiliyor" : roundDisplayNames[round];
  const goToScoreboard = ()=>{ setShowScoreboard(true); setShowFinal(false); };
  const closeScoreboardToTable = ()=>{ setShowScoreboard(false); setShowFinal(false); clearTimers(); setPhase("setup"); };
  const resetToNewGame = ()=>{ setShowScoreboard(false); setShowFinal(false); setShowScores(false); startNewMatch(); setDealAfterReset(true); };
  const handleScoreboardPrimary = ()=>{
    if(isMatchComplete){
      setShowScoreboard(false);
      setShowFinal(false);
      startNewMatch();
      setDealAfterReset(true);
    } else {
      setShowScoreboard(false);
      dealForSelection();
    }
  };
  useEffect(()=>{
    const onResize = ()=> setIsNarrow(window.innerWidth < 600);
    window.addEventListener("resize", onResize);
    return ()=> window.removeEventListener("resize", onResize);
  },[]);
  useEffect(()=>{
    const isFinalOpen = (showFinal || (phase==="finished" && isMatchComplete)) && !showScoreboard;
    const isFinalScoreboardOpen = showScoreboard && isMatchComplete;
    if(!isFinalOpen && !isFinalScoreboardOpen) return;
    const onKey = (e: KeyboardEvent)=>{ if(e.key==="Escape"){ e.preventDefault(); resetToNewGame(); } };
    window.addEventListener("keydown", onKey);
    return ()=> window.removeEventListener("keydown", onKey);
  },[showFinal, showScoreboard, phase, isMatchComplete]);
  const gameBadgeSymbol = phase==="select-round" ? "↻" : (isPenaltyRoundType(round) ? "▲" : "●");

  function scoreSymbols(player: number){
    const c = countsFor(player);
    return (
      <div className="flex flex-wrap gap-1" aria-label={`${NAMES[player]} oynanan oyunlar`}>
        {playedChoices[player].map((r,idx)=>{
          const pen = isPenaltyRoundType(r);
          return <span key={`${r}-${idx}`} title={roundDisplayNames[r]} className="inline-flex flex-col items-center leading-none rounded-md px-1 py-0.5 border bg-white border-[#CBD5E1]"><span className="text-[14px] leading-none" aria-label={`${roundDisplayNames[r]} oynandı`}>{pen?"▲":"●"}</span><span className="text-[8px] font-black mt-0.5">{SHORT_CODE[r]}</span></span>;
        })}
        {Array.from({length:c.remPen}).map((_,k)=>(<span key={`ep-${k}`} title="Oynanacak ceza" className="inline-flex flex-col items-center leading-none rounded-md px-1 py-0.5 border border-dashed border-black/25 bg-white/60 opacity-70"><span className="text-[14px] leading-none">△</span><span className="text-[8px] font-bold mt-0.5 text-[#7a867f]">CEZA</span></span>))}
        {Array.from({length:c.remTru}).map((_,k)=>(<span key={`et-${k}`} title="Oynanacak koz" className="inline-flex flex-col items-center leading-none rounded-md px-1 py-0.5 border border-dashed border-black/25 bg-white/60 opacity-70"><span className="text-[14px] leading-none">○</span><span className="text-[8px] font-bold mt-0.5 text-[#7a867f]">KOZ</span></span>))}
      </div>
    );
  }

  function renderSelectionRows(list: RoundType[], disabled: boolean, selected: RoundType | null, showHint: boolean){
    return (
      <div className="grid gap-1 grid-cols-2 sm:grid-cols-1" role="radiogroup" aria-label="Tur seçimi">
        {list.map((rName)=>{
          const pen = isPenaltyRoundType(rName);
          const isSel = selected===rName;
          const globalCount = pen ? (penaltyCounts[rName] ?? 0) : 0;
          const isClosed = pen && globalCount >= 2 && !fallbackAllowAnyTrump;
          const alreadyPlayed = pen && (playedChoices[chooser]?.includes(rName) ?? false) && !fallbackAllowAnyTrump;
          const isAvailable = chooserAvailable.includes(rName);
          const rowDisabled = disabled || isClosed || alreadyPlayed || !isAvailable;
          return (
            <button key={rName} type="button" role="radio" aria-checked={isSel} aria-disabled={rowDisabled} disabled={rowDisabled} onClick={()=>{ if(!rowDisabled) setSelectedRound(rName); }}
              className={`text-left rounded-full px-2.5 py-1.5 flex gap-1.5 items-center border ${isSel?"bg-[#D1FAE5] border-[#059669]":"bg-white border-[#CBD5E1] hover:border-[#059669]"} ${rowDisabled?"cursor-not-allowed opacity-55 bg-[#F1F5F9]":"cursor-pointer"}`}>
              <span className={`shrink-0 w-[16px] h-[16px] rounded-[4px] border grid place-items-center ${isSel?"bg-[#0f5b36] border-[#0f5b36] text-white":"bg-white border-black/30 text-transparent"}`} aria-hidden>{isClosed ? "✕" : <Check size={11} strokeWidth={3}/>}</span>
              <span className="min-w-0 flex-1 flex items-center flex-wrap gap-x-1.5 gap-y-0">
                <span className="font-extrabold text-[12px] leading-tight">{pen?"▲":"●"} {roundDisplayNames[rName]}</span>
                {isClosed && <span className="text-[9px] font-extrabold text-[#7a867f]">Kapalı</span>}
                {alreadyPlayed && !isClosed && <span className="text-[9px] font-extrabold text-[#7a867f]">Oynandı</span>}
                {pen && !isClosed && <span className="text-[10px] font-bold leading-tight text-[#7a1f2b]">Kalan: {Math.max(0, 2-globalCount)}/2</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function penaltyPileFor(player: number){
    // Küçük kart yığınları kaldırıldı: üstteki botun kapalı elinin üstüne
    // biniyorlardı. Yenen kartlar artık yalnızca Tabela penceresinde
    // özet olarak görünür; masa ortası temiz kalır.
    void player;
    return null;
    // Rıfkı: no pile at all — the King of Hearts is the last card, who took it is obvious.
    // Son İki: no pile at all either — only the brief last-trick effect is shown.
    if(phase==="setup" || phase==="select-round") return null;
    if(round==="Rıfkı") return null;
    if(round==="Son İki Almaz") return null;
    const koz = !!trumpOf(round);
    const tricksWon = stats[player]?.tricks ?? 0;
    const taken = takenCards[player] ?? [];
    const isEl = round==="El Almaz";
    const faceDown = koz || isEl;
    // Piles live in the player's own seat zone, outside the center trick
    // zone, below/away from the avatar + name, pointer-events-none so they
    // can never block a card click. Transparent background, no scrollbar.
    const pos = player===0
      ? "absolute z-[5] left-1/2 -translate-x-1/2 bottom-[96px] sm:bottom-[104px]"
      : player===1
        ? "absolute z-[5] left-[78px] top-1/2 -translate-y-1/2"
        : player===2
          ? "absolute z-[5] left-1/2 -translate-x-1/2 top-[96px]"
          : "absolute z-[5] right-[78px] top-1/2 -translate-y-1/2";
    const pileMaxWidth = "280px";
    // BIGGER mini cards: 40×56, rank 14px / centre suit 16px.
    // FEW (1–6): single horizontal fan, 28px step (~70% visible, rank visible).
    // MANY (7+): DOUBLE COLUMN — two vertical stacks side-by-side, 24px
    // vertical overlap (20px when a column holds 7, so 13 cards stay ≤180px).
    // Example: 10 hearts → 5 + 5 stacked vertically. No truncation, no "+ daha".
    const renderWrapped = (nodes: React.ReactNode[], total: number) => {
      if(!nodes.length) return null;
      if(total <= 6){
        return (
          <span className="flex flex-row items-center justify-center" style={{ maxWidth: 280 }} aria-hidden>
            {nodes.map((node, cIdx)=>(
              <span key={cIdx} className="shrink-0" style={{ marginLeft: cIdx===0 ? 0 : -(40 - 28) }}>
                {node}
              </span>
            ))}
          </span>
        );
      }
      const leftCount = Math.ceil(total / 2);
      const left = nodes.slice(0, leftCount);
      const right = nodes.slice(leftCount);
      const vStep = leftCount >= 7 ? 20 : 24;
      const renderColumn = (col: React.ReactNode[], keyPrefix: string) => (
        <span key={keyPrefix} className="relative shrink-0" style={{ width: 40, height: 56 + Math.max(0, col.length - 1) * vStep }} aria-hidden>
          {col.map((node, idx)=>(
            <span key={idx} className="absolute left-0 shrink-0" style={{ top: idx * vStep }}>
              {node}
            </span>
          ))}
        </span>
      );
      return (
        <span className="flex flex-row items-start justify-center gap-[14px]" style={{ maxWidth: 110, maxHeight: 180 }} aria-hidden>
          {renderColumn(left, "left")}
          {renderColumn(right, "right")}
        </span>
      );
    };
    // Koz / El Almaz: CLOSED / FACE-DOWN pile — ALL won tricks, up to 13.
    // Always rendered — even at 0 tricks an empty slot + "El: 0" is shown.
    if(faceDown){
      const tooltip = `${NAMES[player]} — kazandığı el: ${tricksWon}`;
      const closedNodes = Array.from({length: tricksWon}).map((_,idx)=>(
        <CardBack key={`closed-${idx}`} className="w-[40px] h-[56px]" />
      ));
      return (
        <div className={`${pos} pointer-events-none flex flex-col items-center text-center gap-[2px]`} style={{ maxWidth: pileMaxWidth }} title={tooltip} aria-label={tooltip}>
          <span className="text-[9px] font-bold text-white/90 leading-none bg-black/50 rounded-full px-1.5 py-[2px] whitespace-nowrap">El: {tricksWon}</span>
          {tricksWon===0 ? (
            <span className="w-[40px] h-[56px] rounded-[6px] border border-dashed border-white/50 bg-black/20 grid place-items-center text-white/60 text-[10px] font-black" aria-hidden>—</span>
          ) : renderWrapped(closedNodes, tricksWon)}
        </div>
      );
    }
    // Kız / Erkek / Kupa: penalty pile — EVERY penalty card, no truncation.
    const penCards = penaltyCardsFor(taken, round);
    if(!penCards.length) return null;
    const tooltip = `Yediği: ${penCards.map(c=>`${c.suit} ${c.rank}`).join(", ")}`;
    const penNodes = penCards.map((c)=>(
      <RealCard key={c.id} card={c} showOrnament={false} className="w-[40px] h-[56px]" cornerSize="text-[14px]" centreSize="text-[16px]" suitSize="text-[11px]" />
    ));
    return (
      <div className={`${pos} pointer-events-none flex flex-col items-center text-center gap-[2px]`} style={{ maxWidth: pileMaxWidth }} title={tooltip} aria-label={tooltip}>
        <span className="text-[9px] font-bold text-white/90 leading-none bg-black/50 rounded-full px-1.5 py-[2px] whitespace-nowrap">Yediği: {penCards.length}</span>
        {renderWrapped(penNodes, penCards.length)}
      </div>
    );
  }

  const collectDelta = collecting ? (collecting.winner===0 ? {x:"0px", y:"38vh"} : collecting.winner===1 ? {x:"-38vw", y:"0px"} : collecting.winner===2 ? {x:"0px", y:"-36vh"} : {x:"38vw", y:"0px"}) : {x:"0px", y:"0px"};
  // Kazanan bildirimi her zaman masa ortasında; üstteki botun elinin üstüne binmez.
  const winnerToastPos = collecting ? "left-1/2 -translate-x-1/2 top-[62%]" : "";
  const humanPlayed = trick.find(t=>t.player===0);

  return (
    <div className="flex-1 min-h-0 overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
      {/* Tiny top bar — max 30px, only essentials */}
      <header data-safe-area-sticky-top style={{top:"var(--safe-area-inset-top)"}} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[30px] flex items-center gap-2 px-2 sm:px-3">
        <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
        <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
        <div className="ml-auto flex items-center gap-1.5">
          <SpeedControl />
          <button onClick={onBack} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><Home size={13}/> Menü</button>
          <button onClick={()=>setShowScores(v=>!v)} aria-pressed={showScores} className="bg-[var(--gold)] text-black font-extrabold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><Trophy size={13}/> Tabela</button>
          <button onClick={startNewMatch} className="bg-white/10 border border-white/15 font-bold text-[12px] px-2.5 py-1 rounded-md flex items-center gap-1 h-[26px]"><RefreshCw size={13}/> Yeni Maç</button>
        </div>
      </header>

      {/* Üst tabela şeridi kaldırıldı: masa tam boy kalır, skorlar yalnızca
          üstteki 📊 Tabela butonuyla açılan pencerede görünür. İsim plakaları
          masanın kenarlarında aynen durur. */}
      {/* Felt fills exactly the remaining viewport — never 92vh + headers */}
      <main className="flex-1 min-h-0 flex flex-col w-full overflow-hidden">
        <section className="felt game-table relative flex-1 min-h-0 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-20" style={{backgroundImage:"radial-gradient(rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize:"22px 22px"}} />

          {/* Tiny status strip — inside felt, not a big bar */}
          {phase!=="setup" && (
            <>
              {/* Top-left premium banner — dark glass pill, gold hairline, gloss */}
              <div className="banner-glass absolute z-30 max-w-[210px] rounded-full px-3 py-1.5 pointer-events-none leading-tight overflow-hidden" style={{top:"12px", left:"12px"}} aria-label="Seçilen oyun">
                <span className="banner-shine" aria-hidden />
                <span className="banner-gloss" aria-hidden />
                <div className="relative flex items-center gap-1.5">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#E9B949] text-[#3B2500] grid place-items-center text-[11px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,.8),0_1px_2px_rgba(0,0,0,.5)]" aria-hidden>{round==="Rıfkı" ? "♛" : round==="Kupa Almaz" ? "♥" : isKozRound ? "●" : isPenaltyRoundType(round) ? "▲" : "♛"}</span>
                  <div className="min-w-0">
                    <div className="plastic-orange text-[12px] leading-tight truncate">{gameBadgeSymbol} {gameBadgeRound}</div>
                    <div className="text-[9px] font-bold text-white leading-tight mt-0.5 truncate">Tur {phase==="finished" ? roundsPlayed : roundsPlayed+1}/20 • Seçen: {NAMES[displayChooser]}</div>
                  </div>
                </div>
              </div>
              <div className="absolute top-1 right-1 z-30 flex items-center gap-1 pointer-events-none">
                <div className="bg-black/50 rounded-full px-2 py-0.5 text-[9px] font-bold text-white/85 whitespace-nowrap">
                  {phase==="select-round" ? `Seçim: ${NAMES[chooser]}` : `El ${Math.min(trickNo,13)}/13 • ${phase==="playing" ? (current===-1 ? "Hesaplanıyor…" : NAMES[current]) : phase==="finished" ? "Tur bitti" : ""}`}
                </div>
                <div className="bg-black/50 rounded-full px-2 py-0.5 text-[9px] font-bold text-white/85 whitespace-nowrap">
                  {(round==="Kupa Almaz"||round==="Rıfkı") ? (heartsBroken?"Kupa 🔓":"Kupa 🔒") : isKozRound ? (trumpBroken?"Koz: Açıldı 🔓":"Koz: Kapalı 🔒") : (remainingLabel() ?? "")}
                </div>
              </div>
            </>
          )}
          {/* Son İki — only a brief pulse + toast on the 12th / 13th trick, no pile */}
          {phase==="playing" && round==="Son İki Almaz" && (winnerPreview || collecting) && (trickNo===12 || trickNo===13) && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 animate-pulse bg-[var(--gold)] text-black rounded-full px-3 py-1.5 text-[12px] font-extrabold shadow-lg whitespace-nowrap top-[30%]" role="status">
              {trickNo===12 ? "Son 2 - 1. el" : "Son el!"} • {NAMES[(winnerPreview ?? collecting)!.winner]} kazandı
            </div>
          )}
          {persistError && phase!=="setup" && (
            <div className="absolute top-7 left-1/2 -translate-x-1/2 z-30 bg-red-500 text-white rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap max-w-[96%] overflow-hidden text-ellipsis">{persistError}</div>
          )}

          {/* Bot hands — small, on edges, spaced */}
          {phase!=="setup" && hands[1].length>0 && (
            <div className="absolute z-10 left-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1" aria-label={`Bot Ege kapalı eli, ${hands[1].length} kart`}>
              <div className="relative" style={{width:"56px", height:`${78 + (hands[1].length-1)*8}px`}}>
                {Array.from({length:hands[1].length}).map((_,k)=>{
                  const mid=(hands[1].length-1)/2;
                  return (
                    <div key={k} className="absolute" style={{top:`${k*8}px`, left:"50%", transform:`translateX(-50%) rotate(${(k-mid)*2.5}deg)`}}>
                      <CardBack className="w-[56px] h-[78px]" />
                    </div>
                  );
                })}
              </div>
              <div className="bg-black/60 text-white rounded-xl px-2 py-1 text-[10px] font-extrabold text-center leading-tight break-words max-w-[112px]">Bot Ege<span className="block text-[11px] font-black">{displayTotals[1]>=0 ? `+${displayTotals[1]}` : displayTotals[1]} puan</span><span className="block text-[9px] font-bold opacity-90">Bu tur: {estimatedRoundScores[1]>=0 ? `+${estimatedRoundScores[1]}` : estimatedRoundScores[1]}</span></div>
            </div>
          )}
          {phase!=="setup" && hands[2].length>0 && (
            <div className="absolute z-10 top-1 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" aria-label={`Bot Deniz kapalı eli, ${hands[2].length} kart`}>
              <div className="relative flex flex-row items-start justify-center" style={{width:`${60 + (hands[2].length-1)*9}px`, height:"86px"}}>
                {Array.from({length:hands[2].length}).map((_,k)=>{
                  const mid=(hands[2].length-1)/2;
                  return (
                    <div key={k} className="absolute top-0" style={{left:`${k*9}px`, transform:`rotate(${(k-mid)*2.5}deg)`, transformOrigin:"top center"}}>
                      <CardBack className="w-[60px] h-[84px]" />
                    </div>
                  );
                })}
              </div>
              <div className="bg-black/60 text-white rounded-xl px-2 py-1 text-[10px] font-extrabold text-center leading-tight break-words max-w-[112px]">Bot Deniz<span className="block text-[11px] font-black">{displayTotals[2]>=0 ? `+${displayTotals[2]}` : displayTotals[2]} puan</span><span className="block text-[9px] font-bold opacity-90">Bu tur: {estimatedRoundScores[2]>=0 ? `+${estimatedRoundScores[2]}` : estimatedRoundScores[2]}</span></div>
            </div>
          )}
          {phase!=="setup" && hands[3].length>0 && (
            <div className="absolute z-10 right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1" aria-label={`Bot Ada kapalı eli, ${hands[3].length} kart`}>
              <div className="relative" style={{width:"56px", height:`${78 + (hands[3].length-1)*8}px`}}>
                {Array.from({length:hands[3].length}).map((_,k)=>{
                  const mid=(hands[3].length-1)/2;
                  return (
                    <div key={k} className="absolute" style={{top:`${k*8}px`, left:"50%", transform:`translateX(-50%) rotate(${-(k-mid)*2.5}deg)`}}>
                      <CardBack className="w-[56px] h-[78px]" />
                    </div>
                  );
                })}
              </div>
              <div className="bg-black/60 text-white rounded-xl px-2 py-1 text-[10px] font-extrabold text-center leading-tight break-words max-w-[112px]">Bot Ada<span className="block text-[11px] font-black">{displayTotals[3]>=0 ? `+${displayTotals[3]}` : displayTotals[3]} puan</span><span className="block text-[9px] font-bold opacity-90">Bu tur: {estimatedRoundScores[3]>=0 ? `+${estimatedRoundScores[3]}` : estimatedRoundScores[3]}</span></div>
            </div>
          )}

          {/* Penalty / tricks piles — in front of each seat, clear of the center trick */}
          {penaltyPileFor(2)}
          {penaltyPileFor(1)}
          {penaltyPileFor(3)}
          {penaltyPileFor(0)}

          {/* Turn indicator — tiny dot on current player edge */}
          {phase==="playing" && current>=0 && (
            <div className={`absolute z-20 w-2.5 h-2.5 rounded-full bg-[var(--gold)] shadow ${current===0?"left-3 bottom-[52px]":current===1?"left-[52px] top-1/2 -translate-y-1/2":current===2?"left-1/2 -translate-x-1/2 top-[88px]":"right-[52px] top-1/2 -translate-y-1/2"}`} aria-hidden />
          )}

          {/* Played cards — center for bots, human slot above hand */}
          {trick.filter(t=>t.player!==0).map(t=>{
            const pos = t.player===1 ? {left:"26%", top:"50%"} : t.player===2 ? {left:"50%", top:"32%"} : {left:"74%", top:"50%"};
            const label = t.player===1 ? "Bot Ege" : t.player===2 ? "Bot Deniz" : "Bot Ada";
            return (
              <div key={`${t.player}-${t.card.id}`} className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{left:pos.left, top:pos.top}}>
                <div className="deal"><MiniCard card={t.card}/></div>
                <div className="text-center text-[9px] font-extrabold mt-1 bg-black/55 text-white rounded-full px-1.5 py-px whitespace-nowrap">{label}</div>
              </div>
            );
          })}
          {humanPlayed && (
            <div className="absolute z-20 left-1/2 -translate-x-1/2" style={{bottom:"196px"}}>
              <div className="play-up"><MiniCard card={humanPlayed.card}/></div>
              <div className="text-center text-[9px] font-extrabold mt-1 bg-[var(--gold)] text-black rounded-full px-2 py-px whitespace-nowrap">Senin Attığın</div>
            </div>
          )}

          {/* 1-second pause — all 4 cards stay visible, only the winner hint shows */}
          {winnerPreview && !collecting && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 bg-[var(--gold)] text-black rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-lg whitespace-nowrap top-[62%]" role="status">Eli Kazanan: {NAMES[winnerPreview.winner]} 🏆</div>
          )}

          {/* Collect animation — 4 cards fly to winner */}
          {collecting && (
            <>
              <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
                <div className="collect-fly flex items-center justify-center" style={{["--dx" as string]: collectDelta.x, ["--dy" as string]: collectDelta.y}}>
                  <div className="flex -space-x-6">
                    {collecting.trick.map(t=>(
                      <RealCard key={t.card.id} card={t.card} className="hand-card w-[70px] h-[100px] sm:w-[94px] sm:h-[134px] shrink-0" cornerSize="text-[19px] sm:text-[22px]" centreSize="text-[32px] sm:text-[42px]" suitSize="text-[13px] sm:text-[14px]" />
                    ))}
                  </div>
                </div>
              </div>
              <div className={`absolute z-40 bg-[var(--gold)] text-black rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-lg whitespace-nowrap ${winnerToastPos}`} role="status">Eli Kazanan: {NAMES[collecting.winner]} 🏆</div>
            </>
          )}

          {phase==="playing" && current>0 && trick.length<4 && !resolving && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 bg-black/60 text-white rounded-full px-3 py-1 text-[11px] font-extrabold whitespace-nowrap" style={{bottom:"212px"}} role="status">Sıra: {NAMES[current]} düşünüyor…</div>
          )}
          {phase==="playing" && isKozRound && trick.length===0 && current===0 && !trumpBroken && sequentialLeadCard && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none bg-black/60 text-white" style={{bottom:"212px"}} role="status">
              Koz oynamak istersen A-K-Q sırayla oynamalısın: sıradaki {sequentialLeadCard.rank}. Başka renk de açabilirsin, serbestsin.
            </div>
          )}
          {phase==="playing" && isKozRound && trick.length===0 && current===0 && trumpBroken && committedLeadCard && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 rounded-xl px-2.5 py-1.5 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none bg-black/60 text-white" style={{bottom:"212px"}} role="status">
              A ile kozu sen açtın - şimdi {committedLeadCard.rank === "Q" ? "Q'yu" : "K'yı"} oynamalısın (koz açarsan). Başka renk açmak serbest.
            </div>
          )}
          {mustHint && phase==="playing" && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white rounded-xl px-2.5 py-1 text-[10px] font-extrabold text-center shadow-lg max-w-[92%] pointer-events-none" style={{bottom:"212px"}} role="status">{mustHint}</div>
          )}
          {heartsToast && (round==="Kupa Almaz"||round==="Rıfkı") && (
            <div className="absolute left-1/2 -translate-x-1/2 top-[92px] z-30 bg-emerald-500 text-white rounded-full px-2 py-0.5 text-[10px] font-extrabold whitespace-nowrap" role="status">Kupa açıldı 🔓</div>
          )}
          {blockedInfo && phase==="playing" && current===0 && (
            <div className="absolute left-1/2 -translate-x-1/2 z-40 bg-red-600 text-white rounded-xl px-3 py-2 text-[11px] font-extrabold text-center shadow-lg max-w-[92%] flex items-start gap-2" style={{ bottom: "212px" }} role="status">
              <span className="flex-1">{blockedInfo.text}</span>
              <button onClick={() => setBlockedInfo(null)} className="shrink-0 bg-white/20 rounded-full w-5 h-5 grid place-items-center text-[12px] leading-none" aria-label="Uyarıyı kapat">✕</button>
            </div>
          )}
          {null}

          {/* Human hand — VERY BOTTOM, always fully visible above the taskbar: shrink-0, 12px bottom padding */}
          {phase!=="setup" && (
            <div className="game-hand absolute bottom-0 left-0 right-0 z-30 pt-1 pb-3 shrink-0" style={{background:"rgba(0,0,0,0.35)"}}>
              <div className="text-center text-[10px] font-extrabold text-white/95 mb-0.5 px-2 break-words">
                {phase==="select-round" ? "Elin — İncele ve Seç" : `Sen • ${displayTotals[0]>=0 ? `+${displayTotals[0]}` : displayTotals[0]} puan • ${hands[0].length} kart`} {phase==="playing" && current===0 ? "• Sıra sende" : phase==="playing" ? "• Botlar oynuyor" : phase==="select-round" ? (chooser===0 ? "• Tur seç" : "• Bot seçiyor") : ""}
              </div>
              {hands[0].length===0 && phase!=="setup" ? <p className="text-center text-[12px] font-bold py-3 text-white">Elindeki kartlar bitti.</p> : (
                <div className="flex justify-center overflow-x-clip pt-1 pb-1 px-1">
                  {displayHand0.map((c,idx)=>{
                    const playable = playableIds.has(c.id) && phase==="playing" && current===0 && !resolving;
                    const disabled = phase==="playing" && current===0 && !playable;
                    const isMustPlay = blockedInfo?.mustId === c.id && phase==="playing" && current===0;
                    const mid = (displayHand0.length-1)/2;
                    return (
                      <button key={c.id} type="button" aria-disabled={phase!=="playing" || current!==0 || resolving} onClick={()=>handleHumanCardClick(c)} title={disabled ? blockedReasonFor(c) : `${c.rank} ${c.suit} — oynamak için tıkla`} aria-label={`${c.rank} ${c.suit}${disabled?" - oynanamaz":""}${phase==="select-round"?" - tur seçiliyor":""}`}
                        className={`relative -ml-[10px] first:ml-0 sm:-ml-[6px] ${playable?"playable ring-[3px] ring-[var(--gold)] rounded-[8px] brightness-110":""} ${disabled && phase!=="select-round"?"disabled-card rounded-[8px]":""} ${isMustPlay?"must-play":""}`}
                        style={{ transform:`rotate(${(idx-mid)*1.6}deg) translateY(${Math.abs(idx-mid)*0.8}px)`, zIndex: playable ? 50 + idx : idx }}>
                        {isMustPlay && <span className="must-play-label">Oynaman gereken kart</span>}
                        <RealCard card={c} className="hand-card w-[70px] h-[100px] sm:w-[94px] sm:h-[134px] pointer-events-none" cornerSize="text-[19px] sm:text-[22px]" centreSize="text-[32px] sm:text-[42px]" suitSize="text-[13px] sm:text-[14px]" />
                        {playable && <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[var(--gold)]" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SELECTION — draggable modal */}
          {phase==="select-round" && (
            <>
              <div className="fixed inset-0 z-40 bg-black/45" aria-hidden="true" />
              <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Tur Seç - Elini İncele" style={modalPos ? { left: modalPos.x, top: modalPos.y, maxHeight: "74vh" } : { left: "50%", top: "50%", transform: "translate(-50%,-50%)", maxHeight: "74vh" }} className={`fixed z-50 bg-white text-black rounded-2xl w-[min(640px,90vw)] overflow-hidden p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-[#CBD5E1] ${isDraggingModal ? "shadow-[0_24px_60px_rgba(0,0,0,.55)]" : ""}`}>
                <div onPointerDown={onModalHandlePointerDown} style={{ touchAction: "none" }} className={`flex items-center gap-1.5 -mx-2.5 -mt-2.5 px-2.5 py-1.5 mb-2 ${isNarrow && !modalPos ? "rounded-t-2xl" : "rounded-t-2xl"} bg-[#0f5b36] text-white select-none ${isDraggingModal ? "cursor-grabbing" : "cursor-grab"}`} aria-label="Pencereyi tutup kaydır">
                  <GripVertical size={14} aria-hidden />
                  <span className="font-extrabold text-[12px] flex-1 truncate">Tur Seç</span>
                  <span className="text-[10px] font-bold opacity-90 hidden sm:inline">Seçim: {NAMES[chooser]}</span>
                  <button type="button" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>{ setModalPos(null); setIsDraggingModal(false); }} className="shrink-0 flex items-center gap-0.5 bg-white/15 hover:bg-white/25 rounded-full px-2 py-0.5 text-[10px] font-extrabold" aria-label="Pencereyi merkeze al"><Crosshair size={11}/> Merkeze Al</button>
                </div>
                <p className="text-[11px] font-extrabold text-[#0f5b36] leading-tight">Seçim: {NAMES[chooser]}</p>
                <div className="mt-1.5 bg-white border border-black/10 rounded-xl p-1">
                  <div className="flex flex-nowrap justify-center gap-[2px] overflow-hidden">{displayHand0.map((c)=>(<span key={c.id} title={`${c.rank} ${c.suit}`} className="shrink-0"><RealCard card={c} showOrnament={false} className="w-[22px] h-[30px] sm:w-[24px] sm:h-[34px]" cornerSize="text-[8px]" centreSize="text-[12px]" suitSize="text-[6px]" /></span>))}</div>
                </div>
                {!chooserAvailable.length && <p className="mt-2 text-[12px] font-bold text-center">Hiç seçenek kalmadı — sıra otomatik olarak sonraki oyuncuya geçiyor…</p>}

                {chooser===0 ? (
                  <>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-black/10 gap-2 sm:gap-0">
                      <div className="sm:pr-2">
                        <h4 className="font-extrabold text-[11px] tracking-wider text-[#7a1f2b] mb-1">CEZALAR ▲</h4>
                        {renderSelectionRows(PENALTY_ROUNDS, false, selectedRound, true)}
                      </div>
                      <div className="sm:pl-2">
                        <h4 className="font-extrabold text-[11px] tracking-wider text-[#0f5b36] mb-1">KOZLAR ●</h4>
                        {renderSelectionRows(trumpAvailable, false, selectedRound, true)}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center gap-1.5">
                      <button onClick={randomPick} className="shrink-0 bg-white border border-black/15 font-extrabold text-[12px] px-2.5 py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-[#fff3c4]"><Dices size={14}/> Rastgele</button>
                      <button onClick={startSelected} disabled={!selectedRound} aria-disabled={!selectedRound} className={`w-full sm:w-[300px] font-extrabold text-[13px] py-2 rounded-lg border border-[#047857] flex items-center justify-center gap-1.5 ${selectedRound?"bg-[#059669] text-white":"bg-[#E2E8F0] text-black/40 cursor-not-allowed border-[#CBD5E1]"}`}>
                        BAŞLA ▶ {selectedRound ? `${roundDisplayNames[selectedRound]}` : "Önce bir tur seç"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2" aria-live="polite">
                    <div className="bg-white border border-black/10 rounded-xl p-2 flex items-center gap-1.5">
                      {botThinking || !botPicked ? <RefreshCw size={15} className="animate-spin shrink-0 text-[#0f5b36]"/> : <Crown size={15} className="shrink-0 text-[#0f5b36]"/>}
                      <p className="text-[11px] font-bold leading-tight">{botPicked ? `${NAMES[chooser]} seçti: ${roundDisplayNames[botPicked]} ${isPenaltyRoundType(botPicked)?"▲":"●"} — başlıyor…` : `${NAMES[chooser]} eline bakıyor...`}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-black/10 gap-2 sm:gap-0">
                      <div className="sm:pr-2">
                        <h4 className="font-extrabold text-[11px] tracking-wider text-[#7a1f2b] mb-1">CEZALAR ▲</h4>
                        {renderSelectionRows(PENALTY_ROUNDS, true, selectedRound, false)}
                      </div>
                      <div className="sm:pl-2">
                        <h4 className="font-extrabold text-[11px] tracking-wider text-[#0f5b36] mb-1">KOZLAR ●</h4>
                        {renderSelectionRows(trumpAvailable, true, selectedRound, false)}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <button disabled aria-disabled="true" className="w-full sm:w-[300px] bg-black/10 text-black/40 font-extrabold text-[13px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-not-allowed">
                        BAŞLA ▶ {botPicked ? `${roundDisplayNames[botPicked]} (bot başlatıyor…)` : "Bot seçiyor…"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {phase==="setup" && (
            <div className="absolute inset-0 z-30 grid place-items-center p-4 bg-black/35">
              <div className="pop bg-white text-black rounded-3xl p-5 sm:p-7 max-w-[520px] w-full text-center shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-[#CBD5E1]">
                <div className="font-display font-black text-[32px] leading-none">KING 👑</div>
                <p className="text-[13px] font-semibold text-[#55645b] mt-2">Botlara karşı 20 turluk maç. Herkes sırayla 3 ceza (▲) + 2 koz (●) seçer.</p>
                <button onClick={dealForSelection} className="mt-4 w-full bg-[#0f5b36] text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2"><Play size={18}/> {roundsPlayed>0 ? `Maça Devam — ${roundsPlayed}/20 Oynandı` : "Maça Başla — Kartları Dağıt"}</button>
                <button onClick={()=>setShowHow(v=>!v)} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-1">Nasıl Oynanır? <ChevronDown size={14} className={showHow?"rotate-180":""}/></button>
                {showHow && (
                  <div className="mt-3 text-left text-[12px] leading-snug text-[#4a5a50] bg-white border border-black/10 rounded-2xl p-3">
                    <p>52 kart dağıtılır, herkes 13 kart alır. Yere atılan ilk kartın rengini takip etmek zorunludur. Koz turlarında koz en güçlü karttır. Kupa Almaz&apos;da açılan renkten elinde yoksa ve elinde kupa varsa kupa atmak zorundasın — başka renk atarak kaçamazsın. Rıfkı&apos;da da aynı kural geçerlidir; ancak elinde Rıfkı (Kupa Papazı) varsa bu zorunluluktan muafsın ve Rıfkı&apos;yı korumak için istediğin kartı atabilirsin. Erkek Almaz&apos;da açılan renkten yoksa ve elinde erkek (Vale/Papaz) varsa erkek atmak zorundasın — muafiyet yok, Kupa Papazı da erkektir. Kız Almaz&apos;da açılan renkten yoksa ve elinde kız varsa kız atmak zorundasın. Koz turunda açılan rengin yoksa koz atmak zorundasın; masada koz varsa ve elinde daha büyük koz varsa büyüğünü atmak zorundasın. A-K-Q kuralı: Koz çıkmadan koz oynamak istersen A-K-Q sırayla oynanır. Koz çıkmadan başka renk oynamak istersen serbestsin.</p>
                    <p className="mt-2"><b>Erken bitiş:</b> Kız&apos;da 4 Kız, Erkek&apos;te 8 Vale/Papaz, Kupa&apos;da 13 Kupa oynanınca tur hemen biter. Rıfkı&apos;da Kupa Papazı oynanıp eli çözülünce tur biter.</p>
                    <div className="grid grid-cols-2 gap-1.5 mt-2">{ROUNDS.map(r=>(<div key={r.name} className="border border-black/10 rounded-lg p-2 bg-[#fff8e6]"><div className="font-extrabold">{isPenaltyRoundType(r.name)?"▲":"●"} {r.name}</div><div className="font-bold text-[#b34700]">{r.score}</div><div>{r.desc}</div></div>))}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Tabela popup — holds scores + short rules, off the felt */}
      {showScores && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Tabela">
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[520px] max-h-[84vh] overflow-y-auto p-4 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-[#CBD5E1]">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-display font-black text-[22px] flex items-center gap-2"><Trophy size={18} className="text-[#0f5b36]"/> TABELA</h2><p className="text-[12px] font-semibold text-[#55645b]">Maç {roundsPlayed}/20 • ▲ Ceza, ● Koz • Seçen: {NAMES[displayChooser]}</p><p className="text-[12px] font-extrabold text-[#7a1f2b] mt-1 leading-snug">Cezalar: {globalPenaltyLine}</p><p className="text-[11px] font-bold text-[#0f5b36] mt-1">{phase!=="setup" ? `${roundDisplayNames[round]} • ${info.score} • ${info.desc}` : "Henüz tur seçilmedi."}</p>{persistError && <p className="text-[11px] font-bold text-red-700 mt-1">{persistError}</p>}</div><button onClick={()=>setShowScores(false)} className="p-2 bg-black/5 rounded-full shrink-0" aria-label="Tabelayı kapat"><X size={18}/></button></div>
            <div className="mt-3">
              <ScoreboardTable names={NAMES} history={roundHistory} totals={baseTotals} currentIndex={roundsPlayed} currentRound={phase==="setup" ? null : round} currentScores={estimatedRoundScores} />
            </div>
            <button onClick={()=>setShowScores(false)} className="mt-4 w-full bg-white border border-black/15 font-extrabold py-3 rounded-xl">Kapat</button>
            {isMatchComplete && (
              <button onClick={()=>{ setShowScores(false); setShowFinal(false); setShowScoreboard(false); startNewMatch(); setDealAfterReset(true); }} className="mt-2 w-full bg-[#0f5b36] text-white font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2">YENİ OYUN ▶ — Yeni Maç Başlat</button>
            )}
          </div>
        </div>
      )}

      {false && phase==="finished" && !isMatchComplete && !showScoreboard && null}

      {(showFinal || (phase==="finished" && isMatchComplete)) && !showScoreboard && (
        <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={(e)=>{ if(e.target===e.currentTarget) resetToNewGame(); }}>
          <div className="pop bg-white text-black rounded-3xl w-full max-w-[640px] p-5 sm:p-6 max-h-[92vh] overflow-y-auto relative shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-[#CBD5E1]">
            <button onClick={resetToNewGame} className="absolute top-3 right-3 p-2 bg-black/5 hover:bg-black/10 rounded-full" aria-label="Kapat - Yeni Oyuna Başla (Sıfırla)"><X size={18}/></button>
            <div className="text-center"><div className="text-[40px]">🏆</div><h2 className="font-display font-black text-[30px]">Maç Bitti — Final Sıralaması</h2><p className="text-[13px] font-bold text-[#55645b]">20 tur tamamlandı • Herkes 3 ceza + 2 koz oynadı</p></div>
            <div className="grid gap-2 mt-4">
              {finalOrder.map((idx,rank)=>(
                <div key={NAMES[idx]} className={`rounded-2xl border p-3 flex flex-wrap items-center gap-3 ${rank===0?"border-[var(--gold)] bg-[#fff3c4]":"border-black/10 bg-white"}`}>
                  <span className="font-display font-black text-[22px] w-8">{rank+1}.</span>
                  <span className="font-extrabold flex-1 min-w-[110px]">{NAMES[idx]} {rank===0?"👑":""}</span>
                  <span className="flex flex-wrap gap-1">{playedChoices[idx].map((r,j)=>(<span key={`${r}-${j}`} title={roundDisplayNames[r]} className="inline-flex flex-col items-center bg-white border rounded-lg px-1.5 py-0.5"><span className="text-[16px] leading-none">{isPenaltyRoundType(r)?"▲":"●"}</span><span className="text-[8px] font-black">{SHORT_CODE[r]}</span></span>))}</span>
                  <span className="font-black text-[20px]">{baseTotals[idx]} puan</span>
                </div>
              ))}
            </div>
            <button onClick={()=>{ setShowFinal(false); setShowScoreboard(false); startNewMatch(); setDealAfterReset(true); }} className="mt-4 w-full bg-[#0f5b36] text-white font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2"><RefreshCw size={17}/> YENİ OYUN ▶ — Yeni Maç Başlat</button>
            <button onClick={resetToNewGame} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-3 rounded-xl">KAPAT — Yeni Oyuna Başla (Sıfırla)</button>
          </div>
        </div>
      )}

      {showScoreboard && (
        <div className="fixed inset-0 z-[60] bg-black/70 overflow-y-auto p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Skorboard" onClick={(e)=>{ if(e.target===e.currentTarget){ if(isMatchComplete) resetToNewGame(); else closeScoreboardToTable(); } }}>
          <div className="pop bg-white text-black rounded-[28px] w-full max-w-[580px] mx-auto my-2 sm:my-6 p-4 sm:p-6 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-[#CBD5E1] relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#059669]" aria-hidden />
            <button onClick={()=>{ if(isMatchComplete) resetToNewGame(); else closeScoreboardToTable(); }} className="absolute top-4 right-4 p-2 bg-black/5 hover:bg-black/10 rounded-full" aria-label={isMatchComplete ? "Kapat - Yeni Oyuna Başla (Sıfırla)" : "Kapat - Masaya Dön"}><X size={18}/></button>
            <div className="text-center pr-8">
              <div className="text-[34px] leading-none">🏆</div>
              <h2 className="font-display font-black text-[30px] sm:text-[34px] leading-tight mt-1">SKORBOARD</h2>
              <p className="text-[13px] font-extrabold text-[#0f5b36] mt-1">{isMatchComplete ? "Maç Bitti!" : `Tur ${roundsPlayed} / 20`}</p>
              <p className="text-[12px] font-semibold text-[#55645b] mt-0.5">{isMatchComplete ? "20 tur tamamlandı — herkes 3 ceza + 2 koz oynadı." : "Sıralama toplam puana göredir. Koz + verir, ceza − verir."}</p>
            </div>

            {isMatchComplete && (
              <div className="mt-4 relative overflow-hidden rounded-2xl bg-[#FEF3C7] border-2 border-[#EAB308] px-4 py-3 text-center shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
                <div className="flex justify-center gap-2 text-[20px] leading-none" aria-hidden><span>🎉</span><span>✨</span><span>🎊</span><span>✨</span><span>🎉</span></div>
                <p className="font-display font-black text-[22px] sm:text-[26px] leading-tight mt-1">🎉 Kazanan: {NAMES[finalOrder[0]]}!</p>
                <p className="text-[12px] font-extrabold text-[#5a4300]">{baseTotals[finalOrder[0]]} puan ile maçı kazandı 👑</p>
                <div className="flex justify-center gap-2 text-[20px] leading-none mt-1" aria-hidden><span>🎊</span><span>✨</span><span>🏆</span><span>✨</span><span>🎊</span></div>
              </div>
            )}

            <div className="mt-4 bg-white border border-black/10 rounded-2xl p-3">
              <div className="flex justify-between items-center text-[12px] font-extrabold"><span>Maç İlerlemesi</span><span>{roundsPlayed}/20 tur</span></div>
              <div className="mt-2 h-2.5 rounded-full bg-black/10 overflow-hidden"><div className="h-full rounded-full bg-[#0f5b36] transition-all" style={{width:`${Math.min(100, (roundsPlayed/20)*100)}%`}} /></div>
            </div>

            <div className="grid gap-2.5 mt-4">
              {finalOrder.map((idx,rank)=>{
                const c = countsFor(idx);
                const total = baseTotals[idx];
                const medal = rank===0 ? "🥇" : rank===1 ? "🥈" : rank===2 ? "🥉" : "4.";
                return (
                  <div key={NAMES[idx]} className={`rounded-2xl border p-3 sm:p-3.5 ${rank===0?"border-[var(--gold)] bg-[#fff3c4] shadow-md":"border-black/10 bg-white"}`}>
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 shrink-0 rounded-full bg-[#0f5b36] text-white grid place-items-center font-black text-[15px]">{AVATAR[idx]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[18px] leading-none" aria-hidden>{medal}</span><span className="font-extrabold text-[15px] truncate">{NAMES[idx]}</span><span className="text-[11px] font-bold text-[#7a867f]">{rank+1}. sıra</span></div>
                        <div className="text-[12px] font-bold text-[#55645b] mt-0.5">Oynanan: {c.played}/5 — Kalan Ceza: {c.remPen}, Kalan Koz: {c.remTru}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-black text-[22px] leading-none ${total>0?"text-emerald-700":total<0?"text-red-700":"text-[#17211b]"}`}>{total}</div>
                        <div className="text-[11px] font-extrabold text-[#0f5b36] mt-1">Bu Tur: {roundScores[idx]>=0?`+${roundScores[idx]}`:roundScores[idx]}</div>
                      </div>
                    </div>
                    <div className="mt-2.5">{scoreSymbols(idx)}</div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] font-semibold text-[#7a867f] text-center mt-3 leading-snug">▲ Ceza • ● Koz — Dolu sembol oynandı, boş sembol oynanacak turu gösterir.</p>
            <button onClick={handleScoreboardPrimary} className="mt-4 w-full bg-[#0f5b36] hover:brightness-110 text-white font-extrabold text-[17px] py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg">{isMatchComplete ? "YENİ OYUN ▶ — Yeni Maç Başlat" : "YENİ OYUN ▶"}</button>
            {!isMatchComplete && (
              <button onClick={closeScoreboardToTable} className="mt-2 w-full bg-white border border-black/15 font-extrabold py-3 rounded-xl">Masaya Dön</button>
            )}
          </div>
        </div>
      )}
      {roundToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] bg-[var(--gold)] text-black rounded-full px-3 py-1.5 text-[11px] font-extrabold shadow-lg max-w-[96%] overflow-hidden text-ellipsis pointer-events-none text-center" style={{top:"calc(var(--safe-area-inset-top) + 42px)"}} role="status">{roundToast}</div>
      )}
    </div>
  );
}

const SUPABASE_SQL = `-- KING — Supabase tabloları
create table if not exists members (id uuid primary key default gen_random_uuid(), username text unique not null, display_name text not null, created_at timestamptz default now());
create table if not exists rooms (id uuid primary key default gen_random_uuid(), name text not null, created_by text not null, created_at timestamptz default now());
create table if not exists tables (id uuid primary key default gen_random_uuid(), room_id uuid references rooms(id) on delete cascade, name text not null, status text not null default 'waiting', created_by text not null, created_at timestamptz default now());
create table if not exists seats (id uuid primary key default gen_random_uuid(), table_id uuid references tables(id) on delete cascade, seat_index int not null check (seat_index between 0 and 3), username text, is_bot boolean not null default false, created_at timestamptz default now(), unique (table_id, seat_index));
create table if not exists games (id uuid primary key default gen_random_uuid(), table_id uuid references tables(id) on delete cascade, state jsonb not null, updated_at timestamptz default now());
-- RLS notu: Demo / test için RLS'i kapalı bırakın ya da her tablo için permissive policy açın.
-- Örnek: alter table members enable row level security; create policy "demo" on members for all using (true) with check (true);
-- RLS notu: Demo için tablolarda RLS kapalı olmalı.
-- Üretimde permissive policy kullanmayın; publishable / anon anahtarını paylaşmayın ve username tabanlı üyelik yerine Supabase Auth kullanın.`;

const SUPABASE_PROJECT_ID = "qrazdcmzocoossuikqzz";
const SUPABASE_EXAMPLE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;
type SupabaseKeyFormat = "publishable" | "anon" | "unknown";
function supabaseKeyFormat(key: string): SupabaseKeyFormat{
  const k = key.trim();
  if(k.startsWith("sb_publishable_")) return "publishable";
  if(k.startsWith("eyJ")) return "anon";
  return "unknown";
}
function urlLooksLikeKey(value: string): boolean{
  const v = value.trim();
  return v.includes("sb_publishable_") || v.startsWith("eyJ");
}
function createSupabaseClient(url: string, key: string){
  const u = url.trim();
  const k = key.trim();
  if(!/^https:\/\/.+/i.test(u)) throw new Error("Project URL https:// ile başlamalı.");
  if(k.startsWith("sb_publishable_")){
    if(k.length < 20) throw new Error("Publishable key çok kısa görünüyor.");
  } else if(k.startsWith("eyJ")){
    if(k.length < 20) throw new Error("Eski anon key çok kısa görünüyor.");
  } else {
    throw new Error("Anahtar sb_publishable_... ile başlamalı veya eski anon key (eyJ...) olmalı.");
  }
  // supabase-js v2: createClient(url, key) — anahtar olduğu gibi kullanılır, dönüştürülmez.
  return { url: u, key: k, keyFormat: supabaseKeyFormat(k) };
}





export default function App(){
  const [mode, setMode] = useState<"menu" | "bot" | "friends">(() => {
    try { const p = new URLSearchParams(window.location.search); return p.get("room") ? "friends" : "menu"; } catch { return "menu"; }
  });
  return (
    <div data-safe-area-inset-root style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)" }} className="h-[100dvh] overflow-hidden bg-[var(--surface)] overflow-x-clip flex flex-col">
      {mode === "bot" ? <BotGame onBack={() => setMode("menu")} /> : mode === "friends" ? <SiteApp onBack={() => setMode("menu")} onBot={() => setMode("bot")} /> : (<>
      <header data-safe-area-sticky-top style={{ top: "var(--safe-area-inset-top)" }} className="shrink-0 z-40 bg-[#07130d] border-b border-white/10 h-[36px] flex items-center gap-2 px-2 sm:px-3">
        <span className="w-6 h-6 rounded-full bg-[var(--gold)] text-black grid place-items-center font-display text-[14px] font-black leading-none">K</span>
        <span className="font-display font-black text-[16px] tracking-wide leading-none">KING <span aria-hidden>👑</span></span>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto">
        <section className="felt relative min-h-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[560px] text-center">
            <div className="text-[56px] leading-none">👑</div>
            <h1 className="font-display font-black text-[42px] sm:text-[54px] leading-none mt-2">KING</h1>
            <p className="text-[13px] font-semibold text-white/85 mt-2 leading-snug">Botlara karşı 20 turluk maç ya da arkadaşlarınla aynı masada oyna.<br />Her oyuncu 3 ceza ▲ + 2 koz ● seçer.</p>
            <div className="grid gap-3 mt-6">
              <button onClick={() => setMode("bot")} className="w-full bg-white text-black rounded-2xl p-4 sm:p-5 text-left shadow-lg border border-[#CBD5E1] hover:brightness-105">
                <span className="text-[28px]">🤖</span>
                <span className="block font-display font-black text-[22px] leading-tight mt-1">BOTLARA KARŞI</span>
                <span className="block text-[12px] font-semibold text-[#55645b] mt-1">Hemen başla — çevrimdışı, oda gerekmez. Sen + 3 bot.</span>
                <span className="inline-block mt-2 bg-[#0f5b36] text-white font-extrabold text-[12px] px-3 py-1.5 rounded-lg">OYNA ▶</span>
              </button>
              <button onClick={() => setMode("friends")} className="w-full bg-[#0f5b36] text-white rounded-2xl p-4 sm:p-5 text-left shadow-lg border border-[#E9B949] hover:brightness-110">
                <span className="text-[28px]">👥</span>
                <span className="block font-display font-black text-[22px] leading-tight mt-1">ARKADAŞLARLA OYNA</span>
                <span className="block text-[12px] font-semibold text-white/85 mt-1">Oda kur, kodu paylaş, lobide toplan. 2–3 arkadaş + bot da olur.</span>
                <span className="inline-block mt-2 bg-white text-black font-extrabold text-[12px] px-3 py-1.5 rounded-lg">ODA KUR / KATIL ▶</span>
              </button>
            </div>
            <p className="text-[11px] font-semibold text-white/70 mt-4">Davet linkiyle gelenler doğrudan Arkadaşlarla Oyna ekranına yönlendirilir.</p>
          </div>
        </section>
      </main>
      </>)}
    </div>
  );
}
