import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────
// ⚙️  CONFIGURAÇÃO SUPABASE
// Após criar seu projeto em supabase.com,
// substitua os valores abaixo:
// ─────────────────────────────────────────────
const SUPABASE_URL = "https://udtggjrincredltdaecp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkdGdnanJpbmNyZWRsdGRhZWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjI4NzYsImV4cCI6MjA5MTkzODg3Nn0.Kh0-mlqcYMG7urL7NT7e2tvQBT81lmXM2-qt9rE9EZw";

const CONFIGURED = SUPABASE_URL !== "COLE_SUA_URL_AQUI";

// ─── Supabase helpers ───────────────────────
const sb = async (path, options = {}) => {
  const { prefer, method, body } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=representation',
    },
    ...(body ? { body } : {}),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase [${res.status}]: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const dbLoad = () => sb("fazendas?order=created_at.desc");
const dbInsert = (data) => sb("fazendas", { method: "POST", body: JSON.stringify(data) });
const dbUpdate = (id, data) => sb(`fazendas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data), prefer: "return=minimal" });
const dbDelete = (id) => sb(`fazendas?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });

// ─── Local Storage fallback ──────────────────
const LS_KEY = "agromap_v3";
const LS_QUEUE = "agromap_queue_v3";
const lsLoad = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };
const lsSave = (d) => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} };
const queueLoad = () => { try { return JSON.parse(localStorage.getItem(LS_QUEUE) || "[]"); } catch { return []; } };
const queueSave = (d) => { try { localStorage.setItem(LS_QUEUE, JSON.stringify(d)); } catch {} };
const queueAdd = (item) => { const q = queueLoad(); queueSave([...q, item]); };
const queueRemove = (tempId) => { queueSave(queueLoad().filter(i => i.data.id !== tempId)); };
const isOnline = () => navigator.onLine;

// ─── Constants ──────────────────────────────
const STATES = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const STATUSES = ["Ativo", "Prospecto", "Inativo"];
const SAFRA_LABEL = ["Primeira Safra", "Segunda Safra (Safrinha)"];

const emptyCultura = () => ({ soja: "", sorgo: "", milho: "", algodao: "", outra: "", outra_nome: "" });
const emptyFazenda = () => ({
  cliente: "", fazenda: "", municipio: "", estado: "", status: "Ativo",
  area_total: "", ano_safra: "2025/26",
  lat: "", lng: "",
  safra1_seq: emptyCultura(),
  safra1_irr: emptyCultura(),
  safra2_seq: emptyCultura(),
  safra2_irr: emptyCultura(),
  obs: "",
});

const fmt = (v) => v ? parseFloat(v).toLocaleString("pt-BR") : "—";
const fmtN = (v) => parseFloat(v) || 0;
const totalCultura = (c) => fmtN(c?.soja) + fmtN(c?.milho) + fmtN(c?.algodao) + fmtN(c?.outra);
const totalFazenda = (f) => [f.safra1_seq, f.safra1_irr, f.safra2_seq, f.safra2_irr].reduce((s, c) => s + totalCultura(c), 0);

// ─── Styles ──────────────────────────────────
const INP = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-100 text-sm transition-colors";
const LBL = "block text-green-600 text-xs font-bold mb-1 uppercase tracking-widest";
const CARD = "border border-gray-200 bg-white rounded-xl shadow-sm";

function Fld({ label, children, col }) {
  return <div className={col}><label className={LBL}>{label}</label>{children}</div>;
}


// ─── Cities by state (main cities, lightweight) ──────
const CITIES_BY_STATE = {
  AC:["Rio Branco","Cruzeiro do Sul","Sena Madureira","Tarauacá","Feijó"],
  AL:["Maceió","Arapiraca","Palmeira dos Índios","Rio Largo","Penedo","União dos Palmares","São Miguel dos Campos","Santana do Ipanema"],
  AM:["Manaus","Parintins","Itacoatiara","Manacapuru","Coari","Tefé","Tabatinga","Maués"],
  AP:["Macapá","Santana","Laranjal do Jari","Oiapoque","Mazagão"],
  BA:["Salvador","Feira de Santana","Vitória da Conquista","Camaçari","Itabuna","Juazeiro","Lauro de Freitas","Ilhéus","Jequié","Barreiras","Luís Eduardo Magalhães","Paulo Afonso","Irecê","Senhor do Bonfim","Guanambi","Teixeira de Freitas"],
  CE:["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato","Itapipoca","Maranguape","Iguatu","Quixadá","Russas","Aquiraz"],
  DF:["Brasília","Ceilândia","Taguatinga","Samambaia","Planaltina","Gama","Sobradinho"],
  ES:["Vitória","Serra","Vila Velha","Cariacica","Cachoeiro de Itapemirim","Linhares","São Mateus","Colatina","Guarapari","Aracruz"],
  GO:["Goiânia","Aparecida de Goiânia","Anápolis","Rio Verde","Luziânia","Águas Lindas de Goiás","Valparaíso de Goiás","Trindade","Formosa","Novo Gama","Itumbiara","Senador Canedo","Jataí","Catalão","Mineiros","Inhumas","Caldas Novas","Goianésia","Quirinópolis","Morrinhos"],
  MA:["São Luís","Imperatriz","São José de Ribamar","Timon","Caxias","Codó","Paço do Lumiar","Açailândia","Bacabal","Balsas"],
  MG:["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Ribeirão das Neves","Uberaba","Governador Valadares","Ipatinga","Sete Lagoas","Divinópolis","Santa Luzia","Ibirité","Poços de Caldas","Patos de Minas","Pouso Alegre","Teófilo Otoni","Barbacena","Sabará","Varginha","Araguari","Conselheiro Lafaiete","Ituiutaba","Araxá","Passos","Ubá","Frutal","Lavras","Três Corações"],
  MS:["Campo Grande","Dourados","Três Lagoas","Corumbá","Ponta Porã","Naviraí","Nova Andradina","Aquidauana","Sidrolândia","Paranaíba","Maracaju","Coxim","Chapadão do Sul","Rio Brilhante","Amambai"],
  MT:["Cuiabá","Várzea Grande","Rondonópolis","Sinop","Tangará da Serra","Cáceres","Sorriso","Lucas do Rio Verde","Primavera do Leste","Barra do Garças","Alta Floresta","Juína","Colíder","Nova Mutum","Campo Verde","Sapezal","Campo Novo do Parecis","Água Boa","Querência","Paranatinga"],
  PA:["Belém","Ananindeua","Santarém","Marabá","Parauapebas","Castanhal","Abaetetuba","Cametá","Altamira","Itaituba","Redenção","Tucuruí"],
  PB:["João Pessoa","Campina Grande","Santa Rita","Patos","Bayeux","Sousa","Cajazeiras","Cabedelo"],
  PE:["Recife","Caruaru","Olinda","Petrolina","Paulista","Jaboatão dos Guararapes","Camaragibe","Garanhuns","Vitória de Santo Antão","Igarassu","São Lourenço da Mata","Cabo de Santo Agostinho"],
  PI:["Teresina","Parnaíba","Picos","Piripiri","Floriano","Campo Maior","Barras","União"],
  PR:["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","São José dos Pinhais","Foz do Iguaçu","Colombo","Guarapuava","Paranaguá","Araucária","Toledo","Apucarana","Pinhais","Campo Largo","Arapongas","Almirante Tamandaré","Umuarama","Paranavaí","Francisco Beltrão","Campo Mourão","Cianorte","Cambé","Sarandi","Irati","Telêmaco Borba","Rolândia","Palmas","Ivaiporã","Cornélio Procópio"],
  RJ:["Rio de Janeiro","São Gonçalo","Duque de Caxias","Nova Iguaçu","Niterói","Belford Roxo","São João de Meriti","Campos dos Goytacazes","Petrópolis","Volta Redonda","Magé","Itaboraí","Macaé","Cabo Frio","Nova Friburgo","Angra dos Reis","Nilópolis","Teresópolis","Mesquita","Queimados"],
  RN:["Natal","Mossoró","Parnamirim","São Gonçalo do Amarante","Macaíba","Caicó","Açu","Currais Novos"],
  RO:["Porto Velho","Ji-Paraná","Ariquemes","Vilhena","Cacoal","Rolim de Moura","Guajará-Mirim","Jaru"],
  RR:["Boa Vista","Rorainópolis","Caracaraí","Alto Alegre","Mucajaí"],
  RS:["Porto Alegre","Caxias do Sul","Pelotas","Canoas","Santa Maria","Gravataí","Viamão","Novo Hamburgo","São Leopoldo","Rio Grande","Alvorada","Passo Fundo","Sapucaia do Sul","Uruguaiana","Santa Cruz do Sul","Cachoeirinha","Bagé","Bento Gonçalves","Erechim","Guaíba","Cruz Alta","Lajeado","Ijuí","Alegrete","Santana do Livramento","Cachoeira do Sul","Santo Ângelo","Vacaria","Sarandi","Três Passos"],
  SC:["Florianópolis","Joinville","Blumenau","São José","Chapecó","Criciúma","Itajaí","Lages","Jaraguá do Sul","Palhoça","Balneário Camboriú","Brusque","Tubarão","São Bento do Sul","Caçador","Concórdia","Xanxerê","Araranguá","Mafra","Rio do Sul","Camboriú","Videira","Joaçaba","Canoinhas","Maravilha"],
  SE:["Aracaju","Nossa Senhora do Socorro","Lagarto","Itabaiana","São Cristóvão","Estância","Tobias Barreto","Simão Dias"],
  SP:["São Paulo","Guarulhos","Campinas","São Bernardo do Campo","Santo André","Osasco","São José dos Campos","Ribeirão Preto","Sorocaba","Mauá","Santos","Mogi das Cruzes","São José do Rio Preto","Diadema","Jundiaí","Piracicaba","Carapicuíba","Bauru","Itaquaquecetuba","São Vicente","Franca","Guarujá","Taubaté","Praia Grande","Limeira","Suzano","Taboão da Serra","Sumaré","Barueri","Embu das Artes","Marília","São Carlos","Americana","Araraquara","Indaiatuba","Presidente Prudente","Araçatuba","Jacareí","Hortolândia","Botucatu","Itu","Catanduva","Sertãozinho","Bragança Paulista","Ourinhos","Fernandópolis","Araras","Bebedouro","Votuporanga","Jaú"],
  TO:["Palmas","Araguaína","Gurupi","Porto Nacional","Paraíso do Tocantins","Colinas do Tocantins","Guaraí","Tocantinópolis","Formoso do Araguaia","Dianópolis"],
};

function CitySearch({ estado, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const cities = estado ? (CITIES_BY_STATE[estado] || []) : [];
  const filtered = cities.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
  return (
    <div style={{ position: "relative" }}>
      <input
        className={INP}
        placeholder={estado ? "Digite para buscar..." : "Selecione o estado primeiro"}
        disabled={!estado}
        value={open ? query : value}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setQuery(e.target.value); onChange(""); }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#0a1a06", border: "1px solid #1e3d14", borderRadius: "8px", marginTop: "2px", maxHeight: "200px", overflowY: "auto" }}>
          {filtered.map(c => (
            <div key={c}
              onMouseDown={() => { onChange(c); setQuery(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: "13px", cursor: "pointer", color: "#c0e090", borderBottom: "1px solid #162e0e" }}
              onMouseEnter={e => e.target.style.background = "#1e3d14"}
              onMouseLeave={e => e.target.style.background = "transparent"}
            >{c}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function CulturaBlock({ title, icon, value, onChange, safra = 1 }) {
  const CULTURAS = [
    { key: safra === 2 ? "sorgo" : "soja", label: safra === 2 ? "Sorgo" : "Soja" },
    { key: "milho", label: "Milho" },
    { key: "algodao", label: "Algodão" },
    { key: "outra", label: value.outra_nome || "Outra" },
  ];
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div className="text-green-500 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
        <span>{icon}</span> {title}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CULTURAS.map(c => (
          <div key={c.key}>
            {c.key === "outra" && (
              <input className={INP + " mb-1 text-xs py-1"} placeholder="Nome da cultura"
                value={value.outra_nome || ""}
                onChange={e => onChange({ ...value, outra_nome: e.target.value })} />
            )}
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-xs w-14 shrink-0">{c.label}</span>
              <input type="number" className={INP + " text-xs py-1"} placeholder="ha"
                value={value[c.key] || ""}
                onChange={e => onChange({ ...value, [c.key]: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
      <div className="text-right text-xs text-green-500 mt-2 font-bold">
        Total: {totalCultura(value).toLocaleString("pt-BR")} ha
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed top-4 right-4 bg-green-600 text-black px-4 py-2 rounded-xl text-sm font-black z-50 shadow-xl animate-bounce">
      {msg}
    </div>
  );
}

// ─── Setup Banner ────────────────────────────
function SetupBanner({ onDismiss }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-yellow-700 bg-[#1a1200] rounded-xl p-4 mb-4 text-xs">
      <div className="flex justify-between items-center">
        <div className="text-yellow-400 font-bold flex items-center gap-2">
          ⚠️ Modo demonstração — dados salvos localmente
          <button onClick={() => setOpen(!open)} className="underline text-yellow-500">{open ? "Fechar" : "Ver como conectar Supabase"}</button>
        </div>
        <button onClick={onDismiss} className="text-yellow-700 hover:text-yellow-400">✕</button>
      </div>
      {open && (
        <div className="mt-3 text-[#a0a070] space-y-1 border-t border-yellow-900 pt-3">
          <div className="text-yellow-300 font-bold mb-2">📋 Passo a passo — Supabase gratuito:</div>
          <div>1. Acesse <span className="text-yellow-400">supabase.com</span> → clique em "Start your project"</div>
          <div>2. Crie uma conta gratuita (GitHub ou e-mail)</div>
          <div>3. Clique em "New Project" → dê um nome (ex: agromap) → crie senha → escolha região "South America"</div>
          <div>4. Aguarde ~2 min o projeto inicializar</div>
          <div>5. Vá em <span className="text-yellow-400">Settings → API</span> → copie "Project URL" e "anon public key"</div>
          <div>6. No menu lateral clique em <span className="text-yellow-400">SQL Editor</span> → cole e execute o SQL abaixo:</div>
          <pre className="bg-[#0a0a00] text-green-400 rounded p-3 mt-2 overflow-x-auto text-xs">{`CREATE TABLE fazendas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  cliente text, fazenda text, municipio text,
  estado text, status text, area_total text, ano_safra text,
  lat text, lng text,
  safra1_seq jsonb, safra1_irr jsonb,
  safra2_seq jsonb, safra2_irr jsonb,
  obs text
);
ALTER TABLE fazendas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all" ON fazendas FOR ALL USING (true) WITH CHECK (true);`}</pre>
          <div className="mt-2">7. Cole a URL e a Key no topo do código (SUPABASE_URL e SUPABASE_KEY)</div>
          <div className="text-green-400 font-bold mt-2">✓ Pronto! Dados permanentes e compartilhados entre toda a equipe.</div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────
export default function AgroMap() {
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("");
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [toast, setToast] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(!CONFIGURED);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);
  const mapRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // Online/offline detection + auto-sync
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      syncQueue();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setPendingCount(queueLoad().length);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync on mount if online
  useEffect(() => {
    if (isOnline() && queueLoad().length > 0) syncQueue();
  }, []);

  // Load Leaflet dynamically
  useEffect(() => {
    if (document.getElementById("leaflet-css")) return;
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Init map when tab 3 is selected
  useEffect(() => {
    if (tab !== 3 || !leafletReady) return;
    const L = window.L;
    if (!L) return;
    const el = document.getElementById("agromap-map");
    if (!el) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = L.map("agromap-map", { zoomControl: true }).setView([-15, -52], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "OpenStreetMap"
    }).addTo(map);
    mapRef.current = map;
    const colors = { "Ativo": "#16a34a", "Prospecto": "#d97706", "Inativo": "#9ca3af" };
    const validFarms = farms.filter(function(f) { return f.lat && f.lng && !isNaN(parseFloat(f.lat)); });
    validFarms.forEach(function(f) {
      const color = colors[f.status] || "#16a34a";
      const icon = L.divIcon({
        className: "",
        html: '<div style="background:' + color + ';width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([parseFloat(f.lat), parseFloat(f.lng)], { icon: icon }).addTo(map);
      const t1 = totalCultura(f.safra1_seq || {}) + totalCultura(f.safra1_irr || {});
      const t2 = totalCultura(f.safra2_seq || {}) + totalCultura(f.safra2_irr || {});
      const popup = '<div style="font-family:sans-serif;min-width:180px">'
        + '<div style="font-weight:700;font-size:14px;color:#15803d;margin-bottom:4px">' + (f.fazenda || "") + '</div>'
        + '<div style="font-size:12px;color:#374151;margin-bottom:2px">Cliente: ' + (f.cliente || "") + '</div>'
        + '<div style="font-size:12px;color:#374151;margin-bottom:2px">Local: ' + (f.municipio || "") + '/' + (f.estado || "") + '</div>'
        + '<div style="font-size:12px;color:#374151;margin-bottom:2px">Safra: ' + (f.ano_safra || "") + '</div>'
        + '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb">'
        + '<span style="background:' + color + ';color:white;padding:2px 8px;border-radius:12px;font-size:11px">' + (f.status || "") + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:#374151;margin-top:6px">'
        + '<b>Area Total:</b> ' + (f.area_total || "—") + ' ha<br/>'
        + '<b>1a Safra:</b> ' + t1.toLocaleString("pt-BR") + ' ha<br/>'
        + '<b>2a Safra:</b> ' + t2.toLocaleString("pt-BR") + ' ha'
        + '</div></div>';
      marker.bindPopup(popup);
    });
    if (validFarms.length > 0) {
      const bounds = L.latLngBounds(validFarms.map(function(f) { return [parseFloat(f.lat), parseFloat(f.lng)]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [tab, leafletReady, farms]);

  // Sync pending offline items to Supabase
  const syncQueue = async () => {
    if (!CONFIGURED || syncing) return;
    const queue = queueLoad();
    if (queue.length === 0) return;
    setSyncing(true);
    let remaining = [...queue];
    for (const item of queue) {
      try {
        if (item.action === 'insert') {
          const { id: tempId, ...data } = item.data;
          const result = await dbInsert(data);
          const newId = result?.[0]?.id;
          // Update local storage with real ID
          const local = lsLoad();
          lsSave(local.map(f => f.id === tempId ? { ...f, id: newId, _pending: false } : f));
          setFarms(prev => prev.map(f => f.id === tempId ? { ...f, id: newId, _pending: false } : f));
        } else if (item.action === 'update') {
          await dbUpdate(item.id, item.data);
          const local = lsLoad();
          lsSave(local.map(f => f.id === item.id ? { ...f, _pending: false } : f));
          setFarms(prev => prev.map(f => f.id === item.id ? { ...f, _pending: false } : f));
        } else if (item.action === 'delete') {
          await dbDelete(item.id);
        }
        remaining = remaining.filter(i => i !== item);
        queueSave(remaining);
        setPendingCount(remaining.length);
      } catch (e) {
        console.error('Sync error:', e);
        break;
      }
    }
    setSyncing(false);
    if (remaining.length === 0) showToast('✅ Sincronizado com sucesso!');
  };

  // Load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Always load local first for instant display
      const local = lsLoad();
      if (local.length > 0) setFarms(local);
      try {
        if (CONFIGURED && isOnline()) {
          const remote = await dbLoad();
          setFarms(remote);
          lsSave(remote);
        } else if (local.length === 0) {
          setFarms([]);
        }
      } catch {
        if (local.length > 0) setFarms(local);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Save helpers — with offline queue support
  const persist = useCallback(async (action, data, id) => {
    const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    if (!isOnline() || !CONFIGURED) {
      // Save locally with pending flag
      let local = lsLoad();
      if (action === "insert") {
        const n = { ...data, id: tempId, _pending: true };
        lsSave([n, ...local]);
        queueAdd({ action: "insert", data: n });
        setPendingCount(queueLoad().length);
        return [n];
      }
      if (action === "update") {
        lsSave(local.map(f => f.id === id ? { ...f, ...data, _pending: true } : f));
        queueAdd({ action: "update", id, data });
        setPendingCount(queueLoad().length);
        return;
      }
      if (action === "delete") {
        lsSave(local.filter(f => f.id !== id));
        queueAdd({ action: "delete", id });
        setPendingCount(queueLoad().length);
        return;
      }
    }
    try {
      if (action === "insert") return await dbInsert(data);
      if (action === "update") return await dbUpdate(id, data);
      if (action === "delete") return await dbDelete(id);
    } catch (e) {
      // Fallback to offline if request fails
      let local = lsLoad();
      if (action === "insert") {
        const n = { ...data, id: tempId, _pending: true };
        lsSave([n, ...local]);
        queueAdd({ action: "insert", data: n });
        setPendingCount(queueLoad().length);
        showToast("📴 Salvo offline — sincronizará em breve");
        return [n];
      }
      showToast("Erro ao salvar: " + e.message);
      throw e;
    }
  }, []);

  // ── CRUD ──
  const startNew = () => { setForm(emptyFazenda()); setEditId(null); setTab(0); };
  const startEdit = (f) => {
    setForm({
      ...emptyFazenda(), ...f,
      safra1_seq: { ...emptyCultura(), ...(f.safra1_seq || {}) },
      safra1_irr: { ...emptyCultura(), ...(f.safra1_irr || {}) },
      safra2_seq: { ...emptyCultura(), ...(f.safra2_seq || {}) },
      safra2_irr: { ...emptyCultura(), ...(f.safra2_irr || {}) },
    });
    setEditId(f.id); setTab(1);
  };

  const saveFarm = async () => {
    if (!form.cliente || !form.fazenda) { showToast("Preencha Cliente e Fazenda!"); return; }
    try {
      if (editId) {
        await persist("update", form, editId);
        setFarms(prev => prev.map(f => f.id === editId ? { ...f, ...form } : f));
        showToast("Fazenda atualizada ✓");
      } else {
        const result = await persist("insert", form);
        const novo = result?.[0] || { ...form, id: `loc_${Date.now()}` };
        setFarms(prev => [novo, ...prev]);
        showToast("Fazenda cadastrada ✓");
      }
      setForm(null); setEditId(null); setTab(1);
    } catch {}
  };

  const deleteFarm = async (id) => {
    if (!confirm("Remover esta fazenda?")) return;
    await persist("delete", null, id);
    setFarms(prev => prev.filter(f => f.id !== id));
    showToast("Removido.");
  };

  // Geolocation
  const getGeo = () => {
    if (!navigator.geolocation) { showToast("GPS não disponível."); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setGeoLoading(false); showToast("Localização capturada ✓");
      },
      () => { setGeoLoading(false); showToast("Não foi possível obter localização."); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Filtered
  const filtered = farms.filter(f => {
    const matchText = f.cliente?.toLowerCase().includes(filter.toLowerCase()) ||
      f.fazenda?.toLowerCase().includes(filter.toLowerCase());
    const matchStatus = filterStatus === "Todos" || f.status === filterStatus;
    return matchText && matchStatus;
  });

  // Analytics
  const totalArea = farms.reduce((s, f) => s + fmtN(f.area_total), 0);
  const culturaTotals = ["soja", "milho", "algodao", "outra"].map(c => ({
    name: c === "algodao" ? "Algodão" : c.charAt(0).toUpperCase() + c.slice(1),
    total: farms.reduce((s, f) =>
      s + fmtN(f.safra1_seq?.[c]) + fmtN(f.safra1_irr?.[c]) + fmtN(f.safra2_seq?.[c]) + fmtN(f.safra2_irr?.[c]), 0),
  }));
  const maxC = Math.max(...culturaTotals.map(c => c.total), 1);
  const totalIrrig = farms.reduce((s, f) => s + totalCultura(f.safra1_irr) + totalCultura(f.safra2_irr), 0);
  const totalSeq = farms.reduce((s, f) => s + totalCultura(f.safra1_seq) + totalCultura(f.safra2_seq), 0);

  // AI
  const runAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setAiResult("");
    try {
      const ctx = farms.length
        ? `Carteira com ${farms.length} fazenda(s):\n` + farms.slice(0, 20).map(f =>
            `• ${f.fazenda} (${f.cliente}, ${f.municipio}/${f.estado}, ${f.status}): ` +
            `Área total declarada: ${f.area_total}ha. ` +
            `1ª Safra seq: S${f.safra1_seq?.soja||0}/M${f.safra1_seq?.milho||0}/A${f.safra1_seq?.algodao||0}ha. ` +
            `1ª Safra irr: S${f.safra1_irr?.soja||0}/M${f.safra1_irr?.milho||0}/A${f.safra1_irr?.algodao||0}ha. ` +
            `2ª Safra seq: S${f.safra2_seq?.soja||0}/M${f.safra2_seq?.milho||0}ha. ` +
            `2ª Safra irr: S${f.safra2_irr?.soja||0}/M${f.safra2_irr?.milho||0}ha.`
          ).join("\n")
        : "Nenhuma fazenda cadastrada.";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "Você é um consultor agrícola sênior especializado em carteiras de clientes agricultores no Brasil. Responda em português, de forma objetiva e prática, com foco em negócios e oportunidades comerciais.",
          messages: [{ role: "user", content: `${ctx}\n\nAnálise: ${aiPrompt}` }],
        }),
      });
      const data = await res.json();
      setAiResult(data.content?.map(b => b.text || "").join("\n") || "Sem resposta.");
    } catch { setAiResult("Erro ao consultar IA."); }
    setAiLoading(false);
  };

  // ── Export Excel ──
  const exportExcel = () => {
    if (farms.length === 0) { showToast("Nenhuma fazenda para exportar!"); return; }
    const esc = (v) => {
      if (v == null || v === "") return "";
      const s = String(v).replace(/\r?\n/g, " ");
      return (s.includes(",") || s.includes('"')) ? ('"' + s.replace(/"/g, '""') + '"') : s;
    };
    const H = ["Cliente","Fazenda","Municipio","Estado","Status","Ano Safra","Area Total ha","Lat","Lng",
      "1S Seq Soja","1S Seq Milho","1S Seq Algodao","1S Seq Outra Nome","1S Seq Outra ha",
      "1S Irr Soja","1S Irr Milho","1S Irr Algodao","1S Irr Outra Nome","1S Irr Outra ha",
      "2S Seq Sorgo","2S Seq Milho","2S Seq Algodao","2S Seq Outra Nome","2S Seq Outra ha",
      "2S Irr Sorgo","2S Irr Milho","2S Irr Algodao","2S Irr Outra Nome","2S Irr Outra ha",
      "Total 1a Safra ha","Total 2a Safra ha","Total Geral ha","Total Irrigado ha","Total Sequeiro ha","Obs"];
    const rows = farms.map(f => {
      const a = f.safra1_seq || {}, b = f.safra1_irr || {}, c = f.safra2_seq || {}, d = f.safra2_irr || {};
      const t1 = totalCultura(a)+totalCultura(b), t2 = totalCultura(c)+totalCultura(d);
      return [f.cliente,f.fazenda,f.municipio,f.estado,f.status,f.ano_safra,f.area_total,f.lat,f.lng,
        a.soja,a.milho,a.algodao,a.outra_nome,a.outra,
        b.soja,b.milho,b.algodao,b.outra_nome,b.outra,
        c.sorgo,c.milho,c.algodao,c.outra_nome,c.outra,
        d.sorgo,d.milho,d.algodao,d.outra_nome,d.outra,
        t1.toFixed(2),t2.toFixed(2),(t1+t2).toFixed(2),
        (totalCultura(b)+totalCultura(d)).toFixed(2),
        (totalCultura(a)+totalCultura(c)).toFixed(2),f.obs].map(esc);
    });
    const csv = [H.map(esc).join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AgroMap_" + new Date().toLocaleDateString("pt-BR").replace(/\//g,"-") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Relatorio exportado!");
  };

  const TABS = ["📋 Cadastro", "🗂️ Fazendas", "📊 Análise", "🗺️ Mapa", "🤖 IA"];

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center text-green-600">
        <div className="text-4xl animate-spin mb-3" style={{fontFamily:"monospace"}}>⟳</div>
        <div className="text-sm tracking-widest">Carregando AGRO·MAP...</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-gray-800" style={{ fontFamily: "'Courier New', monospace" }}>
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo circular com 4 culturas */}
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Círculo de fundo */}
              <circle cx="22" cy="22" r="21" fill="#0a1a06" stroke="#3a7a1a" strokeWidth="1.2"/>
              
              {/* ALGODÃO - quadrante superior esquerdo (capulho) */}
              {/* Pétalas do capulho */}
              <ellipse cx="13" cy="13" rx="3.5" ry="2.5" fill="#e8f5e0" stroke="#5a9e2f" strokeWidth="0.6" transform="rotate(-45 13 13)"/>
              <ellipse cx="13" cy="13" rx="3.5" ry="2.5" fill="#e8f5e0" stroke="#5a9e2f" strokeWidth="0.6" transform="rotate(45 13 13)"/>
              <ellipse cx="13" cy="13" rx="3.5" ry="2.5" fill="#e8f5e0" stroke="#5a9e2f" strokeWidth="0.6" transform="rotate(0 13 13)"/>
              <ellipse cx="13" cy="13" rx="3.5" ry="2.5" fill="#e8f5e0" stroke="#5a9e2f" strokeWidth="0.6" transform="rotate(90 13 13)"/>
              {/* Centro do capulho */}
              <circle cx="13" cy="13" r="2" fill="#c8e0a0" stroke="#5a9e2f" strokeWidth="0.5"/>
              {/* Sépala */}
              <line x1="13" y1="16" x2="12" y2="20" stroke="#3a7a1a" strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="13" y1="16" x2="14" y2="19.5" stroke="#3a7a1a" strokeWidth="0.6" strokeLinecap="round"/>

              {/* SOJA - quadrante superior direito (vagem) */}
              {/* Vagem curva */}
              <path d="M28 8 Q35 10 34 17" stroke="#6ab030" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
              {/* Grãos dentro da vagem */}
              <ellipse cx="29.5" cy="9.5" rx="1.4" ry="1" fill="#8aba40" transform="rotate(-20 29.5 9.5)"/>
              <ellipse cx="31.5" cy="11.5" rx="1.4" ry="1" fill="#8aba40" transform="rotate(-10 31.5 11.5)"/>
              <ellipse cx="33" cy="14" rx="1.4" ry="1" fill="#8aba40" transform="rotate(5 33 14)"/>
              {/* Folha pequena */}
              <ellipse cx="27" cy="10" rx="2" ry="1.2" fill="#4a8a20" stroke="#3a7a1a" strokeWidth="0.4" transform="rotate(-40 27 10)"/>

              {/* MILHO - quadrante inferior direito (espiga) */}
              {/* Palha/bráctea */}
              <path d="M28 24 Q33 26 32 36" stroke="#4a8a20" strokeWidth="1" fill="none" strokeLinecap="round"/>
              <path d="M30 23 Q36 27 33 36" stroke="#3a7a1a" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
              {/* Corpo da espiga */}
              <rect x="26" y="25" width="5" height="10" rx="2.5" fill="#e8b830" stroke="#c89820" strokeWidth="0.6"/>
              {/* Grãos da espiga */}
              <circle cx="27.5" cy="27" r="0.9" fill="#f0ca40"/>
              <circle cx="29.5" cy="27" r="0.9" fill="#f0ca40"/>
              <circle cx="27.5" cy="29" r="0.9" fill="#f0ca40"/>
              <circle cx="29.5" cy="29" r="0.9" fill="#f0ca40"/>
              <circle cx="27.5" cy="31" r="0.9" fill="#f0ca40"/>
              <circle cx="29.5" cy="31" r="0.9" fill="#f0ca40"/>
              {/* Cabelo do milho */}
              <path d="M27 25 Q25 21 26 19" stroke="#d4a820" strokeWidth="0.6" fill="none" strokeLinecap="round"/>
              <path d="M28.5 25 Q27 20 28 18" stroke="#d4a820" strokeWidth="0.6" fill="none" strokeLinecap="round"/>
              <path d="M30 25 Q30 20 31 18" stroke="#d4a820" strokeWidth="0.6" fill="none" strokeLinecap="round"/>

              {/* SORGO - quadrante inferior esquerdo (panícula) */}
              {/* Haste principal */}
              <line x1="14" y1="36" x2="14" y2="24" stroke="#5a9e2f" strokeWidth="1.2" strokeLinecap="round"/>
              {/* Ramificações da panícula */}
              <line x1="14" y1="24" x2="10" y2="20" stroke="#4a8a28" strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="14" y1="25" x2="11" y2="21" stroke="#4a8a28" strokeWidth="0.7" strokeLinecap="round"/>
              <line x1="14" y1="26" x2="18" y2="21" stroke="#4a8a28" strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="14" y1="25.5" x2="17" y2="21.5" stroke="#4a8a28" strokeWidth="0.7" strokeLinecap="round"/>
              <line x1="14" y1="24.5" x2="13" y2="20" stroke="#4a8a28" strokeWidth="0.7" strokeLinecap="round"/>
              {/* Grãos nas pontas */}
              <circle cx="10" cy="19.5" r="1.2" fill="#8a5a20"/>
              <circle cx="11" cy="20.5" r="1" fill="#a06828"/>
              <circle cx="13" cy="19.5" r="1.2" fill="#8a5a20"/>
              <circle cx="17" cy="21" r="1" fill="#a06828"/>
              <circle cx="18" cy="20.5" r="1.2" fill="#8a5a20"/>

              {/* Divisórias sutis em cruz */}
              <line x1="22" y1="2" x2="22" y2="42" stroke="#1e3d14" strokeWidth="0.5" opacity="0.6"/>
              <line x1="2" y1="22" x2="42" y2="22" stroke="#1e3d14" strokeWidth="0.5" opacity="0.6"/>
            </svg>
            <div>
              <div className="text-green-600 font-black tracking-widest text-lg leading-none">AGRO·MAP</div>
              <div className="text-gray-400 text-xs tracking-wider flex items-center gap-2">
                v3.0 · {CONFIGURED ? "☁️ Supabase" : "💾 Local"}
                {!online && <span className="text-yellow-500 font-bold">· 📴 Offline</span>}
                {online && syncing && <span className="text-blue-400 font-bold">· 🔄 Sincronizando...</span>}
                {online && !syncing && pendingCount > 0 && (
                  <button onClick={syncQueue} className="text-yellow-400 font-bold hover:text-yellow-300 transition-colors">
                    · ⏳ {pendingCount} pendente(s) — toque para sincronizar
                  </button>
                )}
                {online && !syncing && pendingCount === 0 && CONFIGURED && <span className="text-green-500">· ✅ Sincronizado</span>}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div className="text-green-600 font-bold">{farms.length} fazenda(s)</div>
            <div>{totalArea.toLocaleString("pt-BR")} ha</div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-0.5 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => { if (i === 0) startNew(); else setTab(i); }}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg whitespace-nowrap transition-all border-t border-x flex-shrink-0 ${tab === i ? "bg-gray-100 border-gray-200 text-green-600" : "border-transparent text-gray-500 hover:text-green-600"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <Toast msg={toast} />

      <div className="max-w-5xl mx-auto px-4 py-5">
        {showSetup && <SetupBanner onDismiss={() => setShowSetup(false)} />}

        {/* ── TAB 0: FAZENDAS ── */}
        {tab === 1 && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              <input className={INP + " max-w-xs"} placeholder="🔍 Cliente ou fazenda..." value={filter} onChange={e => setFilter(e.target.value)} />
              <select className={INP + " w-auto"} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option>Todos</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <button onClick={startNew} className="bg-green-600 text-black font-black px-4 py-2 rounded-lg text-xs hover:bg-green-500 transition-colors ml-auto">
                + Nova Fazenda
              </button>
            </div>
            <div className="text-gray-400 text-xs">{filtered.length} resultado(s)</div>

            {filtered.length === 0 && (
              <div className="text-center py-16 border-gray-300">
                <div className="text-5xl mb-3">🌱</div>
                <div>Nenhuma fazenda encontrada.</div>
                <button onClick={startNew} className="mt-3 text-green-600 text-xs underline">Cadastrar primeira fazenda</button>
              </div>
            )}

            {filtered.map(f => {
              const areaTot = totalFazenda(f);
              const expanded = expandedId === f.id;
              return (
                <div key={f.id} className={CARD + " overflow-hidden"}>
                  <div className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-green-600 font-black truncate">{f.fazenda}</div>
                        <div className="text-gray-500 text-xs">{f.cliente} · {f.municipio}/{f.estado}</div>
                        {f.lat && <div className="text-[#2a3a1a] text-xs mt-0.5">📍 {f.lat}, {f.lng}</div>}
                      </div>
                      <div className="flex gap-1.5 items-center shrink-0 flex-wrap justify-end">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${f.status === "Ativo" ? "border-[#6ab030] text-green-600" : f.status === "Prospecto" ? "border-yellow-600 text-yellow-600" : "border-gray-200 border-gray-300"}`}>{f.status}</span>
                        {f.ano_safra && <span className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-500">🌾 {f.ano_safra}</span>}
                      {f._pending && <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-700 text-yellow-500 animate-pulse">⏳ Pendente</span>}
                        <button onClick={() => setExpandedId(expanded ? null : f.id)} className="text-gray-500 hover:text-green-600 text-xs px-2 py-1 border border-gray-200 rounded-lg transition-colors">{expanded ? "▲" : "▼"}</button>
                        <button onClick={() => startEdit(f)} className="text-gray-500 hover:text-green-600 text-xs px-2 py-1 border border-gray-200 rounded-lg transition-colors">✏️</button>
                        <button onClick={() => deleteFarm(f.id)} className="text-[#2a1a1a] hover:text-red-400 text-xs px-2 py-1 border border-[#1a0a0a] rounded-lg transition-colors">✕</button>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3 flex-wrap text-xs">
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        Área Total: <span className="text-green-600 font-bold">{fmt(f.area_total)} ha</span>
                      </span>
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        Plantado: <span className="text-green-600 font-bold">{areaTot.toLocaleString("pt-BR")} ha</span>
                      </span>
                      <span className="bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
                        Irrigado: <span className="text-green-600 font-bold">{(totalCultura(f.safra1_irr) + totalCultura(f.safra2_irr)).toLocaleString("pt-BR")} ha</span>
                      </span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-200 bg-white px-4 py-4 space-y-3">
                      {[
                        ["1ª Safra · Sequeiro", f.safra1_seq, "🌤️"],
                        ["1ª Safra · Irrigado", f.safra1_irr, "💧"],
                        ["2ª Safra · Sequeiro", f.safra2_seq, "🌤️"],
                        ["2ª Safra · Irrigado", f.safra2_irr, "💧"],
                      ].map(([title, data, icon]) => {
                        if (!data || totalCultura(data) === 0) return null;
                        return (
                          <div key={title} className="text-xs">
                            <div className="text-green-500 font-bold mb-1">{icon} {title}</div>
                            <div className="flex gap-2 flex-wrap">
                              {[["Soja", data.soja], ["Sorgo", data.sorgo], ["Milho", data.milho], ["Algodão", data.algodao], [data.outra_nome || "Outra", data.outra]].map(([l, v]) =>
                                v ? <span key={l} className="bg-gray-100 border border-gray-200 rounded px-2 py-0.5">{l}: <span className="text-green-600 font-bold">{fmt(v)} ha</span></span> : null
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {f.obs && <div className="text-gray-500 text-xs italic border-t border-gray-200 pt-2">"{f.obs}"</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB 1: CADASTRO ── */}
        {tab === 0 && form && (
          <div className="space-y-4">
            <div className={CARD + " p-5"}>
              <div className="text-green-600 font-black text-sm uppercase tracking-widest mb-4">
                {editId ? "✏️ Editar Fazenda" : "➕ Nova Fazenda"}
              </div>

              {/* Dados do cliente */}
              <div className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-3">▸ Dados do Cliente</div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Fld label="Cliente *" col="col-span-1"><input className={INP} placeholder="Nome do cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} /></Fld>
                <Fld label="Status" col="col-span-1">
                  <select className={INP} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Fld>
                <Fld label="Ano de Safra" col="col-span-2">
                  <select className={INP} value={form.ano_safra || "2025/26"} onChange={e => setForm(f => ({ ...f, ano_safra: e.target.value }))}>
                    {["2022/23","2023/24","2024/25","2025/26","2026/27","2027/28","2028/29"].map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </Fld>
              </div>

              {/* Dados da fazenda */}
              <div className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-3 border-t border-gray-200 pt-4">▸ Dados da Fazenda</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Fld label="Fazenda *" col="col-span-2 md:col-span-1"><input className={INP} placeholder="Nome da fazenda" value={form.fazenda} onChange={e => setForm(f => ({ ...f, fazenda: e.target.value }))} /></Fld>
                <Fld label="Área Total (ha)" col="col-span-2 md:col-span-1"><input type="number" className={INP} placeholder="0" value={form.area_total} onChange={e => setForm(f => ({ ...f, area_total: e.target.value }))} /></Fld>
                <Fld label="Município" col="col-span-1">
                  <CitySearch estado={form.estado} value={form.municipio} onChange={v => setForm(f => ({ ...f, municipio: v }))} />
                </Fld>
                <Fld label="Estado" col="col-span-1">
                  <select className={INP} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                    <option value="">Selecione</option>
                    {STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Fld>
              </div>

              {/* Geolocalização */}
              <div className="border border-gray-200 rounded-xl p-3 mb-4">
                <div className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-2">📍 Geolocalização</div>
                <div className="flex gap-2 items-end">
                  <Fld label="Latitude" col="flex-1"><input className={INP} placeholder="Ex: -15.123456" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} /></Fld>
                  <Fld label="Longitude" col="flex-1"><input className={INP} placeholder="Ex: -49.654321" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} /></Fld>
                  <button onClick={getGeo} disabled={geoLoading}
                    className="mb-0.5 bg-[#1e3d14] hover:bg-[#2a5a1a] text-green-600 font-bold px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 whitespace-nowrap">
                    {geoLoading ? "⟳" : "📍 GPS"}
                  </button>
                </div>
              </div>

              {/* Safras */}
              {[
                { label: "🌾 Primeira Safra", seqKey: "safra1_seq", irrKey: "safra1_irr", safra: 1 },
                { label: "🌿 Segunda Safra (Safrinha)", seqKey: "safra2_seq", irrKey: "safra2_irr", safra: 2 },
              ].map(({ label, seqKey, irrKey, safra }) => (
                <div key={label} className="border border-gray-200 rounded-xl p-4 mb-4">
                  <div className="text-green-600 text-xs font-black uppercase tracking-widest mb-3">{label}</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <CulturaBlock title="Área Sequeiro" icon="🌤️" value={form[seqKey]} onChange={v => setForm(f => ({ ...f, [seqKey]: v }))} safra={safra} />
                    <CulturaBlock title="Área Irrigada" icon="💧" value={form[irrKey]} onChange={v => setForm(f => ({ ...f, [irrKey]: v }))} safra={safra} />
                  </div>
                </div>
              ))}

              {/* Observações */}
              <Fld label="Observações" col="">
                <textarea className={INP + " resize-none"} rows={3} placeholder="Notas livres sobre o cliente ou a fazenda..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
              </Fld>

              <div className="flex gap-3 mt-4">
                <button onClick={saveFarm} className="bg-green-600 text-black font-black px-6 py-2.5 rounded-xl text-sm hover:bg-green-500 transition-colors">
                  {editId ? "✓ Salvar" : "+ Cadastrar"}
                </button>
                <button onClick={() => { setForm(null); setEditId(null); setTab(1); }} className="border border-gray-200 text-gray-500 px-4 py-2.5 rounded-xl text-sm hover:text-green-600 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: ANÁLISE ── */}
        {tab === 2 && (
          <div className="space-y-4">
            {/* Export button */}
            <div className="flex justify-end">
              <button onClick={exportExcel}
                className="flex items-center gap-2 bg-green-50 hover:bg-green-100 border border-[#2a5a14] text-green-600 font-bold px-4 py-2 rounded-xl text-xs transition-colors">
                📊 Exportar Excel
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Clientes", [...new Set(farms.map(f => f.cliente))].length],
                ["Fazendas", farms.length],
                ["Área Total", totalArea.toLocaleString("pt-BR") + " ha"],
                ["Ativos", farms.filter(f => f.status === "Ativo").length],
              ].map(([l, v]) => (
                <div key={l} className={CARD + " p-4 text-center"}>
                  <div className="text-gray-500 text-xs uppercase mb-1">{l}</div>
                  <div className="text-green-600 text-xl font-black">{v}</div>
                </div>
              ))}
            </div>

            <div className={CARD + " p-5"}>
              <div className="text-green-600 text-xs uppercase tracking-widest mb-4 font-black">◆ Área Total por Cultura</div>
              {culturaTotals.map(c => (
                <div key={c.name} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{c.name}</span>
                    <span className="text-green-600 font-bold">{c.total.toLocaleString("pt-BR")} ha</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-700"
                      style={{ width: `${(c.total / maxC) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={CARD + " p-4"}>
                <div className="text-green-600 text-xs uppercase tracking-widest mb-3 font-black">💧 Irrigado vs Sequeiro</div>
                {[["Irrigado", totalIrrig, "#6ab030"], ["Sequeiro", totalSeq, "#3a7a1a"]].map(([l, v, c]) => (
                  <div key={l} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span>{l}</span><span style={{ color: c }} className="font-bold">{v.toLocaleString("pt-BR")} ha</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v / (totalIrrig + totalSeq || 1)) * 100}%`, backgroundColor: c }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className={CARD + " p-4"}>
                <div className="text-green-600 text-xs uppercase tracking-widest mb-3 font-black">📊 Por Status</div>
                {STATUSES.map(s => {
                  const n = farms.filter(f => f.status === s).length;
                  return (
                    <div key={s} className="flex justify-between items-center text-xs mb-2">
                      <span>{s}</span>
                      <span className="text-green-600 font-bold bg-gray-100 px-2 py-0.5 rounded">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={CARD + " p-4"}>
              <div className="text-green-600 text-xs uppercase tracking-widest mb-3 font-black">🏆 Top Fazendas por Área Plantada</div>
              {[...farms].sort((a, b) => totalFazenda(b) - totalFazenda(a)).slice(0, 5).map((f, i) => (
                <div key={f.id} className="flex items-center gap-3 text-xs mb-2">
                  <span className="text-gray-500 w-4">{i + 1}</span>
                  <div className="flex-1 truncate"><span className="text-gray-800">{f.fazenda}</span> <span className="text-gray-500">{f.cliente}</span></div>
                  <span className="text-green-600 font-bold shrink-0">{totalFazenda(f).toLocaleString("pt-BR")} ha</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: IA ── */}
        {tab === 3 && (
          <div className="space-y-4">
            {/* Legend */}
            <div className="flex gap-3 flex-wrap items-center">
              {[["Ativo","#16a34a"],["Prospecto","#d97706"],["Inativo","#9ca3af"]].map(([s,c]) => (
                <div key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <div style={{background:c,width:"10px",height:"10px",borderRadius:"50%",border:"1.5px solid white",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                  {s}
                </div>
              ))}
              <span className="text-xs text-gray-400 ml-auto">{farms.filter(f=>f.lat&&f.lng).length} fazenda(s) com GPS</span>
            </div>
            {/* Map container */}
            {!leafletReady ? (
              <div className="border border-gray-200 rounded-xl bg-gray-50 flex items-center justify-center" style={{height:"420px"}}>
                <div className="text-center text-gray-400">
                  <div className="text-2xl animate-spin mb-2">⟳</div>
                  <div className="text-sm">Carregando mapa...</div>
                </div>
              </div>
            ) : (
              <div id="agromap-map" style={{height:"420px",borderRadius:"12px",border:"1px solid #e5e7eb",overflow:"hidden"}}/>
            )}
            {farms.filter(f => !f.lat || !f.lng).length > 0 && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ {farms.filter(f => !f.lat || !f.lng).length} fazenda(s) sem GPS — use o botão 📍 GPS no cadastro para adicionar localização.
              </div>
            )}
          </div>
        )}

        {tab === 4 && (
          <div className="space-y-4">
            <div className={CARD + " p-5"}>
              <div className="text-green-600 font-black text-sm mb-1">🤖 IA Consultora Agrícola</div>
              <div className="text-gray-500 text-xs mb-4">Análise inteligente baseada nos dados reais da sua carteira.</div>
              <div className="grid grid-cols-1 gap-2 mb-4 md:grid-cols-2">
                {[
                  "Quais clientes têm maior área disponível para expandir?",
                  "Analise o mix de culturas e potencial de diversificação",
                  "Oportunidades de crescimento em segunda safra",
                  "Comparativo irrigado vs sequeiro — oportunidades",
                  "Clientes prospectos com maior potencial de conversão",
                  "Estratégias para aumentar participação em algodão",
                ].map(s => (
                  <button key={s} onClick={() => setAiPrompt(s)}
                    className="text-left text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-500 hover:border-green-300 hover:text-green-600 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
              <textarea className={INP + " resize-none mb-3"} rows={3} placeholder="Sua pergunta ou análise..."
                value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} />
              <button onClick={runAI} disabled={aiLoading || !aiPrompt.trim()}
                className="bg-green-600 text-black font-black px-6 py-2.5 rounded-xl text-sm hover:bg-green-500 transition-colors disabled:opacity-40 flex items-center gap-2">
                {aiLoading ? <><span className="animate-spin inline-block">⟳</span> Analisando...</> : "🤖 Consultar IA"}
              </button>
            </div>
            {aiResult && (
              <div className={CARD + " p-5 border-green-300"}>
                <div className="text-green-600 text-xs uppercase tracking-widest mb-3 font-black">◆ Análise</div>
                <div className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{aiResult}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PWA install hint */}
      <div className="fixed bottom-4 right-4 border-gray-300 text-xs text-right pointer-events-none">
        <div>📱 Para instalar como app:</div>
        <div>iOS: Compartilhar → Tela Inicial</div>
        <div>Android: Menu → Instalar app</div>
      </div>
    </div>
  );
}
