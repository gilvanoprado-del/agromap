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
  telefone: "", email: "", gerente: "", consultor: "",
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
const INP = "w-full bg-[#faf7f2] border border-[#ddd8cc] rounded-lg px-3 py-2 text-[#1a1a14] placeholder-[#a0987a] focus:outline-none focus:border-[#3a7a1a] focus:ring-1 focus:ring-[#e8f0d8] text-sm transition-colors";
const LBL = "block text-[#3a7a1a] text-xs font-bold mb-1 uppercase tracking-wider";
const CARD = "border border-[#ddd8cc] bg-[#faf7f2] rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.07)]";

function Fld({ label, children, col }) {
  return <div className={col}><label className={LBL}>{label}</label>{children}</div>;
}


// ─── Cities by state (main cities, lightweight) ──────
const CITIES_BY_STATE = {
  // MATOPIBA completo — Portaria MAPA 244/2015
  MA:["Açailândia","Afonso Cunha","Alto Parnaíba","Amarante do Maranhão","Arari","Avelino Lopes","Bacabal","Balsas","Barão de Grajaú","Barra do Corda","Brejo","Buriti Bravo","Caxias","Chapadinha","Codó","Coelho Neto","Colinas","Davinópolis","Dom Pedro","Duque Bacelar","Esperantinópolis","Estreito","Feira Nova do Maranhão","Fernando Falcão","Formosa da Serra Negra","Fortaleza dos Nogueiras","Fortuna","Gonçalves Dias","Governador Archer","Governador Edison Lobão","Governador Eugênio Barros","Grajaú","Guadalupe","Imperatriz","Itaipava do Grajaú","Jatobá","João Lisboa","Joselândia","Lago da Pedra","Lago do Junco","Lago dos Rodrigues","Lagoa Grande do Maranhão","Lajeado Novo","Lima Campos","Loreto","Magalhães de Almeida","Mata Roma","Matões","Matões do Norte","Milagres do Maranhão","Mirador","Miranda do Norte","Montes Altos","Nova Colinas","Nova Iorque","Paraibano","Pastos Bons","Pedreiras","Peritoró","Porto Franco","Presidente Dutra","Riachão","Ribamar Fiquene","Sambaíba","Santa Filomena do Maranhão","Santo Antônio dos Lopes","São Domingos do Azeitão","São Felix de Balsas","São Francisco do Brejão","São Francisco do Maranhão","São João do Paraíso","São Luís Gonzaga do Maranhão","São Pedro dos Crentes","São Raimundo das Mangabeiras","São Raimundo do Doca Bezerra","São Roberto","Senador Alexandre Costa","Senador La Rocque","Sítio Novo","Sucupira do Norte","Sucupira do Riachão","Tasso Fragoso","Tuntum","Urbano Santos","Vargem Grande","Vila Nova dos Martírios","Vitória do Mearim","Zé Doca"],
  TO:["Aguiarnópolis","Aliança do Tocantins","Almas","Alvorada","Ananás","Angico","Aparecida do Rio Negro","Aragominas","Araguacema","Araguaçu","Araguaína","Araguanã","Araguatins","Arapoema","Arraias","Augustinópolis","Aurora do Tocantins","Axixá do Tocantins","Babaçulândia","Bandeirantes do Tocantins","Barra do Ouro","Barrolândia","Bernardo Sayão","Bom Jesus do Tocantins","Brasilândia do Tocantins","Brejinho de Nazaré","Buriti do Tocantins","Cachoeirinha","Campos Lindos","Cariri do Tocantins","Carmolândia","Carrasco Bonito","Caseara","Centenário","Chapada da Natividade","Chapada de Areia","Colinas do Tocantins","Colméia","Combinado","Conceição do Tocantins","Couto Magalhães","Cristalândia","Crixás do Tocantins","Darcinópolis","Dianópolis","Divinópolis do Tocantins","Dois Irmãos do Tocantins","Dueré","Esperantina","Fátima","Figueirópolis","Filadélfia","Formoso do Araguaia","Fortaleza do Tabocão","Goianorte","Goiatins","Guaraí","Gurupi","Ipueiras","Itacajá","Itaguatins","Itapiratins","Itaporã do Tocantins","Jaú do Tocantins","Juarina","Lagoa da Confusão","Lagoa do Tocantins","Lajeado","Lavandeira","Lizarda","Luzinópolis","Marianópolis do Tocantins","Mateiros","Maurilândia do Tocantins","Miracema do Tocantins","Miranorte","Monte do Carmo","Monte Santo do Tocantins","Muricilândia","Natividade","Nazaré","Nova Olinda","Nova Rosalândia","Novo Acordo","Novo Alegre","Novo Jardim","Oliveira de Fátima","Palmas","Palmeirante","Palmeirópolis","Paraíso do Tocantins","Paranã","Pau D'Arco","Pedro Afonso","Peixe","Pequizeiro","Pindorama do Tocantins","Piraquê","Pium","Ponte Alta do Bom Jesus","Ponte Alta do Tocantins","Porto Alegre do Tocantins","Porto Nacional","Praia Norte","Presidente Kennedy","Pugmil","Recursolândia","Riachinho","Rio da Conceição","Rio dos Bois","Rio Sono","Sampaio","Santa Fé do Araguaia","Santa Maria do Tocantins","Santa Rita do Tocantins","Santa Rosa do Tocantins","Santa Tereza do Tocantins","Santa Terezinha do Tocantins","São Bento do Tocantins","São Félix do Tocantins","São Miguel do Tocantins","São Salvador do Tocantins","São Sebastião do Tocantins","São Valério","Silvanópolis","Sítio Novo do Tocantins","Sucupira","Taguatinga","Taipas do Tocantins","Talismã","Tocantínia","Tocantinópolis","Tupirama","Tupiratins","Wanderlândia","Xambioá"],
  PI:["Alvorada do Gurguéia","Avelino Lopes","Bom Jesus","Baixa Grande do Ribeiro","Barreiras do Piauí","Bonfim do Piauí","Brejo do Piauí","Caracol","Corrente","Cristino Castro","Curimatá","Currais","Eliseu Martins","Fartura do Piauí","Gilbués","Guadalupe","Júlio Borges","Landri Sales","Manoel Emídio","Monte Alegre do Piauí","Morro Cabeça no Tempo","Palmeira do Piauí","Parnaguá","Pavussu","Porto Alegre do Piauí","Redenção do Gurguéia","Ribeiro Gonçalves","Santa Filomena","Santa Luz","Santa Rosa do Piauí","São Gonçalo do Gurguéia","Sebastião Barros","Sebastião Leal","Uruçuí"],
  BA:["Baianópolis","Barreiras","Bonito","Brejolândia","Canápolis","Carinhanha","Cocos","Coribe","Correntina","Cotegipe","Cristópolis","Feira da Mata","Formosa do Rio Preto","Jaborandi","Luís Eduardo Magalhães","Mansidão","Riachão das Neves","Santa Maria da Vitória","Santa Rita de Cássia","Santana","São Desidério","Serra do Ramalho","Serra Dourada","Tabocas do Brejo Velho","Wanderley"],
  // Demais estados mantidos
  AC:["Rio Branco","Cruzeiro do Sul","Sena Madureira","Tarauacá","Feijó"],
  AL:["Maceió","Arapiraca","Palmeira dos Índios","Rio Largo","Penedo","União dos Palmares"],
  AM:["Manaus","Parintins","Itacoatiara","Manacapuru","Coari","Tefé"],
  AP:["Macapá","Santana","Laranjal do Jari","Oiapoque","Mazagão"],
  CE:["Fortaleza","Caucaia","Juazeiro do Norte","Maracanaú","Sobral","Crato"],
  DF:["Brasília","Ceilândia","Taguatinga","Samambaia","Planaltina"],
  ES:["Vitória","Serra","Vila Velha","Cariacica","Cachoeiro de Itapemirim"],
  GO:["Goiânia","Aparecida de Goiânia","Anápolis","Rio Verde","Luziânia","Jataí","Catalão","Mineiros"],
  MG:["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim","Montes Claros","Uberaba","Patos de Minas"],
  MS:["Campo Grande","Dourados","Três Lagoas","Corumbá","Ponta Porã","Maracaju","Chapadão do Sul"],
  MT:["Cuiabá","Várzea Grande","Rondonópolis","Sinop","Sorriso","Lucas do Rio Verde","Primavera do Leste","Campo Verde","Sapezal","Campo Novo do Parecis"],
  PA:["Belém","Ananindeua","Santarém","Marabá","Parauapebas","Castanhal","Altamira","Redenção","Tucuruí"],
  PB:["João Pessoa","Campina Grande","Santa Rita","Patos","Bayeux","Sousa"],
  PE:["Recife","Caruaru","Olinda","Petrolina","Paulista","Jaboatão dos Guararapes","Garanhuns"],
  PR:["Curitiba","Londrina","Maringá","Ponta Grossa","Cascavel","Foz do Iguaçu","Guarapuava","Toledo","Apucarana"],
  RJ:["Rio de Janeiro","São Gonçalo","Duque de Caxias","Nova Iguaçu","Niterói","Campos dos Goytacazes","Petrópolis"],
  RN:["Natal","Mossoró","Parnamirim","São Gonçalo do Amarante","Caicó"],
  RO:["Porto Velho","Ji-Paraná","Ariquemes","Vilhena","Cacoal"],
  RR:["Boa Vista","Rorainópolis","Caracaraí"],
  RS:["Porto Alegre","Caxias do Sul","Pelotas","Canoas","Santa Maria","Passo Fundo","Uruguaiana","Santa Cruz do Sul","Bento Gonçalves","Erechim"],
  SC:["Florianópolis","Joinville","Blumenau","São José","Chapecó","Criciúma","Itajaí","Lages","Jaraguá do Sul"],
  SE:["Aracaju","Nossa Senhora do Socorro","Lagarto","Itabaiana","São Cristóvão"],
  SP:["São Paulo","Guarulhos","Campinas","São Bernardo do Campo","Santo André","Osasco","São José dos Campos","Ribeirão Preto","Sorocaba","Santos","Bauru","Franca","Presidente Prudente","Araçatuba","Marília","São Carlos","Araraquara"],
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
    <div className="bg-[#f5f0e8] border border-[#ddd8cc] rounded-xl p-3">
      <div className="text-[#4a8a24] text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
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
              <span className="text-[#5a5a42] text-xs w-14 shrink-0">{c.label}</span>
              <input type="number" className={INP + " text-xs py-1"} placeholder="ha"
                value={value[c.key] || ""}
                onChange={e => onChange({ ...value, [c.key]: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
      <div className="text-right text-xs text-[#4a8a24] mt-2 font-bold">
        Total: {totalCultura(value).toLocaleString("pt-BR")} ha
      </div>
    </div>
  );
}

// ─── Toast ───────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed top-4 right-4 bg-[#3a7a1a] text-black px-4 py-2 rounded-xl text-sm font-black z-50 shadow-xl animate-bounce">
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
          <div>2. Crie uma conta
