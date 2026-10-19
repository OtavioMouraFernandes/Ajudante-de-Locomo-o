import {
    AutoModel,
    AutoProcessor,
    RawImage,
    pipeline
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";


/* =====================================================================
   CONFIGURAÇÕES  (tudo que você pode precisar ajustar fica aqui)
   ===================================================================== */

// ---------- Modelos ----------
const MODELO_YOLO = "onnx-community/yolov10n";
const MODELO_PROFUNDIDADE = "onnx-community/depth-anything-v2-small";

// Tenta usar a placa de vídeo (WebGPU). Se o navegador não suportar,
// ou der erro ao carregar, cai automaticamente para o modo normal (wasm).
// Se aparecerem erros estranhos durante a inferência, troque para false.
const USAR_WEBGPU = true;

// ---------- YOLO (reconhece objetos conhecidos) ----------
// Antes era 0.6. Valores menores detectam mais coisas (e mais falsos positivos).
const LIMIAR_CONFIANCA = 0.35;

// Lado maior da imagem enviada ao YOLO. O modelo trabalha em 640 de qualquer jeito.
const YOLO_LADO_MAIOR = 640;

// Campo de visão da câmera no LADO MAIOR da imagem, em graus.
// Câmera traseira de celular costuma ficar entre 65 e 70.
// Usado para converter tamanho na imagem -> distância em metros.
const FOV_LADO_MAIOR_GRAUS = 67;

// Objeto conhecido mais perto que isso (em metros) é "muito próximo".
const DISTANCIA_ALERTA_M = 2.0;

// Para objetos que NÃO estão na tabela DIMENSOES_REAIS (sem como calcular metros):
// se a caixa ocupar mais que essa fração da imagem, considera "muito próximo".
const FRACAO_AREA_SEM_REFERENCIA = 0.25;

// Só conta como obstáculo se a caixa tocar a faixa central da imagem
// (0 = borda esquerda, 1 = borda direita). Ignora coisas bem nas laterais.
const FAIXA_CAMINHO = { inicio: 0.2, fim: 0.8 };

// ---------- Profundidade (enxerga QUALQUER obstáculo, mesmo sem nome) ----------
const USAR_PROFUNDIDADE = true;

// Lado maior da imagem enviada ao modelo de profundidade.
// Menor = mais rápido e menos preciso. 518 é o tamanho nativo do modelo.
const PROFUNDIDADE_LADO_MAIOR = 518;

// Região da imagem analisada (0 = topo, 1 = base).
// Ignoramos a parte de baixo porque ali aparece o CHÃO perto dos pés,
// que não é obstáculo. Se o celular estiver inclinado para baixo, diminua "base".
const PROFUNDIDADE_ROI = { topo: 0.15, base: 0.65 };

// Em vez do valor máximo (sensível a ruído), usamos este percentil da zona.
const PROFUNDIDADE_PERCENTIL = 0.9;

// ⚠️ PRECISA SER CALIBRADO. Valor da profundidade (inverso da distância:
// maior = mais perto) a partir do qual a zona é considerada "muito próxima".
// O console imprime "PROF -> frente: <valor>" a cada análise.
// Veja a seção "Calibração" da documentação.
const LIMIAR_PROFUNDIDADE_PERTO = 8;

// Quais zonas da imagem podem disparar alerta pela profundidade.
// Só "frente" por padrão: parede ao lado em corredor não deve apitar toda hora.
const ZONAS_QUE_ALERTAM = ["frente"];

// Zonas horizontais (fração da largura).
const ZONAS = [
    { nome: "esquerda", inicio: 0.0, fim: 0.3 },
    { nome: "frente",   inicio: 0.3, fim: 0.7 },
    { nome: "direita",  inicio: 0.7, fim: 1.0 }
];

// ---------- Tamanho real aproximado dos objetos (metros) ----------
// Usado para estimar a distância: distância = foco * tamanhoReal / tamanhoNaImagem.
// Para adicionar um objeto, use o nome EM INGLÊS que o YOLO devolve (log "RAW ->").
// O código calcula pela altura e pela largura e fica com a MENOR distância
// (escolha conservadora: na dúvida, avisa mais cedo).
const DIMENSOES_REAIS = {
    "person":        { altura: 1.7,  largura: 0.5 },
    "bicycle":       { altura: 1.0,  largura: 0.6 },
    "motorcycle":    { altura: 1.1,  largura: 0.8 },
    "car":           { altura: 1.5,  largura: 1.8 },
    "bus":           { altura: 3.0,  largura: 2.5 },
    "truck":         { altura: 3.0,  largura: 2.5 },
    "fire hydrant":  { altura: 0.7,  largura: 0.4 },
    "stop sign":     { altura: 0.75, largura: 0.75 },
    "parking meter": { altura: 1.2,  largura: 0.3 },
    "bench":         { altura: 0.85, largura: 1.5 },
    "dog":           { altura: 0.5,  largura: 0.4 },
    "horse":         { altura: 1.6,  largura: 0.6 },
    "backpack":      { altura: 0.5,  largura: 0.35 },
    "suitcase":      { altura: 0.6,  largura: 0.4 },
    "chair":         { altura: 0.9,  largura: 0.5 },
    "couch":         { altura: 0.9,  largura: 2.0 },
    "potted plant":  { altura: 0.6,  largura: 0.4 },
    "bed":           { altura: 0.6,  largura: 1.6 },
    "dining table":  { altura: 0.75, largura: 1.5 },
    "tv":            { altura: 0.5,  largura: 0.9 },
    "refrigerator":  { altura: 1.7,  largura: 0.7 }
};

// Nomes falados em português (o que não estiver aqui é falado em inglês).
const NOMES_PT = {
    "person": "Pessoa",
    "bicycle": "Bicicleta",
    "car": "Carro",
    "motorcycle": "Moto",
    "bus": "Ônibus",
    "truck": "Caminhão",
    "traffic light": "Semáforo",
    "fire hydrant": "Hidrante",
    "stop sign": "Placa de pare",
    "parking meter": "Parquímetro",
    "bench": "Banco",
    "dog": "Cachorro",
    "cat": "Gato",
    "horse": "Cavalo",
    "backpack": "Mochila",
    "umbrella": "Guarda-chuva",
    "handbag": "Bolsa",
    "suitcase": "Mala",
    "skateboard": "Skate",
    "bottle": "Garrafa",
    "chair": "Cadeira",
    "couch": "Sofá",
    "potted plant": "Vaso de planta",
    "bed": "Cama",
    "dining table": "Mesa",
    "toilet": "Vaso sanitário",
    "tv": "Televisão",
    "laptop": "Notebook",
    "sink": "Pia",
    "refrigerator": "Geladeira"
};


/* =====================================================================
   CARREGAMENTO DOS MODELOS
   ===================================================================== */

const dispositivo =
    (USAR_WEBGPU && "gpu" in navigator) ? "webgpu" : "wasm";

console.log("Dispositivo de inferência:", dispositivo);


// Tenta carregar com o dispositivo escolhido; se falhar, usa o padrão.
async function comFallback(carregar) {

    try {

        return await carregar({ device: dispositivo });

    } catch (erro) {

        console.warn(
            "Falha com",
            dispositivo,
            "- usando configuração padrão.",
            erro
        );

        return await carregar({});
    }
}


console.log("Carregando YOLO...");
console.time("carregarmodelo");

const model = await comFallback(
    (opcoes) => AutoModel.from_pretrained(MODELO_YOLO, opcoes)
);

const processor =
    await AutoProcessor.from_pretrained(MODELO_YOLO);

console.timeEnd("carregarmodelo");
console.log("YOLO carregado.");


// O modelo de profundidade é opcional: se falhar ao carregar,
// o sistema continua funcionando só com o YOLO.
let estimadorProfundidade = null;

if (USAR_PROFUNDIDADE) {

    try {

        console.log("Carregando modelo de profundidade...");
        console.time("carregarprofundidade");

        estimadorProfundidade = await comFallback(
            (opcoes) => pipeline(
                "depth-estimation",
                MODELO_PROFUNDIDADE,
                opcoes
            )
        );

        console.timeEnd("carregarprofundidade");
        console.log("Modelo de profundidade carregado.");

    } catch (erro) {

        console.error(
            "Profundidade indisponível, seguindo só com YOLO:",
            erro
        );
    }
}


/* =====================================================================
   FUNÇÕES AUXILIARES
   ===================================================================== */

// Canvas reutilizado para reduzir a imagem antes de enviar aos modelos.
const canvasReduzido = document.createElement("canvas");

const ctxReduzido = canvasReduzido.getContext(
    "2d",
    { willReadFrequently: true }
);


// Copia o canvas original reduzido (lado maior = ladoMaior).
function reduzirCanvas(canvas, ladoMaior) {

    const escala = Math.min(
        1,
        ladoMaior / Math.max(canvas.width, canvas.height)
    );

    canvasReduzido.width = Math.round(canvas.width * escala);
    canvasReduzido.height = Math.round(canvas.height * escala);

    ctxReduzido.drawImage(
        canvas,
        0,
        0,
        canvasReduzido.width,
        canvasReduzido.height
    );

    return canvasReduzido;
}


// "esquerda" | "frente" | "direita" segundo o centro horizontal.
function calcularDirecao(centroX, larguraImagem) {

    const posicao = centroX / larguraImagem;

    if (posicao < ZONAS[0].fim) return "esquerda";
    if (posicao > ZONAS[2].inicio) return "direita";
    return "frente";
}


// A caixa toca a faixa central (o "caminho" da pessoa)?
function estaNoCaminho(xmin, xmax, larguraImagem) {

    return (
        xmax >= larguraImagem * FAIXA_CAMINHO.inicio &&
        xmin <= larguraImagem * FAIXA_CAMINHO.fim
    );
}


// Estima a distância (metros) pelo modelo "pinhole":
//   distância = distânciaFocal(px) * tamanhoReal(m) / tamanhoNaImagem(px)
// Retorna null se a classe não está na tabela DIMENSOES_REAIS.
function estimarDistancia(
    classe,
    largura,
    altura,
    larguraImagem,
    alturaImagem
) {

    const referencia = DIMENSOES_REAIS[classe];

    if (!referencia || largura <= 0 || altura <= 0) {
        return null;
    }

    const focalPx =
        (Math.max(larguraImagem, alturaImagem) / 2) /
        Math.tan((FOV_LADO_MAIOR_GRAUS * Math.PI / 180) / 2);

    const distanciaPelaAltura =
        focalPx * referencia.altura / altura;

    const distanciaPelaLargura =
        focalPx * referencia.largura / largura;

    return Math.min(distanciaPelaAltura, distanciaPelaLargura);
}


/* =====================================================================
   DETECÇÃO 1: YOLO (objetos conhecidos, com nome e distância)
   ===================================================================== */

async function detectarComYolo(canvas) {

    const reduzido = reduzirCanvas(canvas, YOLO_LADO_MAIOR);

    const imagem = await RawImage.fromCanvas(reduzido);

    const imagemProcessada = await processor(imagem);

    const { output0 } = await model({
        images: imagemProcessada.pixel_values
    });

    const resultadoLista = output0.tolist()[0];

    const [alturaProcessada, larguraProcessada] =
        imagemProcessada.reshaped_input_sizes[0];

    // Converte do tamanho processado para o tamanho da imagem enviada...
    const escalaX = imagem.width / larguraProcessada;
    const escalaY = imagem.height / alturaProcessada;

    // ...e depois para o tamanho do canvas original (reduzido -> original).
    const fatorOriginalX = canvas.width / imagem.width;
    const fatorOriginalY = canvas.height / imagem.height;

    const deteccoes = [];

    for (const [
        xminBruto,
        yminBruto,
        xmaxBruto,
        ymaxBruto,
        score,
        id
    ] of resultadoLista) {

        if (score < LIMIAR_CONFIANCA) {
            continue;
        }

        const classe = model.config.id2label[id];

        const xmin = xminBruto * escalaX * fatorOriginalX;
        const ymin = yminBruto * escalaY * fatorOriginalY;
        const xmax = xmaxBruto * escalaX * fatorOriginalX;
        const ymax = ymaxBruto * escalaY * fatorOriginalY;

        const largura = xmax - xmin;
        const altura = ymax - ymin;

        const distanciaM = estimarDistancia(
            classe,
            largura,
            altura,
            canvas.width,
            canvas.height
        );

        const noCaminho = estaNoCaminho(xmin, xmax, canvas.width);

        let muitoProximo;

        if (distanciaM !== null) {

            muitoProximo =
                noCaminho && distanciaM <= DISTANCIA_ALERTA_M;

        } else {

            // Classe sem tamanho real conhecido: usa a fração da imagem.
            const fracaoArea =
                (largura * altura) /
                (canvas.width * canvas.height);

            muitoProximo =
                noCaminho && fracaoArea >= FRACAO_AREA_SEM_REFERENCIA;
        }

        console.log(
            `YOLO -> ${classe} | confiança: ${score.toFixed(2)} | ` +
            `distância: ${distanciaM === null ? "?" : distanciaM.toFixed(1) + " m"} | ` +
            `no caminho: ${noCaminho} | muito próximo: ${muitoProximo}`
        );

        deteccoes.push({

            origem: "yolo",

            xmin,
            ymin,
            xmax,
            ymax,

            altura,
            largura,

            id,
            classe,
            nomePt: NOMES_PT[classe] || classe,
            score,

            distanciaM,
            direcao: calcularDirecao(
                (xmin + xmax) / 2,
                canvas.width
            ),

            muitoProximo
        });
    }

    return deteccoes;
}


/* =====================================================================
   DETECÇÃO 2: PROFUNDIDADE (qualquer obstáculo, mesmo sem nome)
   ===================================================================== */

async function detectarComProfundidade(canvas) {

    const reduzido = reduzirCanvas(canvas, PROFUNDIDADE_LADO_MAIOR);

    const imagem = await RawImage.fromCanvas(reduzido);

    // "predicted_depth" é o valor BRUTO do modelo (inverso da distância).
    // "depth" (imagem 0-255) é normalizado a cada frame e NÃO serve aqui,
    // porque uma parede distante ficaria tão "clara" quanto uma parede perto.
    const resultado = await estimadorProfundidade(imagem);

    const tensor = resultado.predicted_depth;

    const [h, w] = tensor.dims.slice(-2);

    const dados = tensor.data;

    const y0 = Math.floor(PROFUNDIDADE_ROI.topo * h);
    const y1 = Math.floor(PROFUNDIDADE_ROI.base * h);

    const deteccoes = [];

    for (const zona of ZONAS) {

        const x0 = Math.floor(zona.inicio * w);
        const x1 = Math.floor(zona.fim * w);

        // Amostra 1 a cada 2 pixels (mais rápido, sem perder muita precisão).
        const valores = [];

        for (let y = y0; y < y1; y += 2) {
            for (let x = x0; x < x1; x += 2) {
                valores.push(dados[y * w + x]);
            }
        }

        if (valores.length === 0) {
            continue;
        }

        const ordenados = Float32Array.from(valores).sort();

        const valor = ordenados[
            Math.floor(PROFUNDIDADE_PERCENTIL * (ordenados.length - 1))
        ];

        const muitoProximo =
            ZONAS_QUE_ALERTAM.includes(zona.nome) &&
            valor >= LIMIAR_PROFUNDIDADE_PERTO;

        // Esta linha é a base da calibração.
        console.log(
            `PROF -> ${zona.nome}: ${valor.toFixed(2)} ` +
            `(limiar ${LIMIAR_PROFUNDIDADE_PERTO}) | muito próximo: ${muitoProximo}`
        );

        // Mesmo formato dos objetos do YOLO, para o resto do código
        // tratar tudo igual.
        const xmin = zona.inicio * canvas.width;
        const xmax = zona.fim * canvas.width;
        const ymin = PROFUNDIDADE_ROI.topo * canvas.height;
        const ymax = PROFUNDIDADE_ROI.base * canvas.height;

        deteccoes.push({

            origem: "profundidade",

            xmin,
            ymin,
            xmax,
            ymax,

            largura: xmax - xmin,
            altura: ymax - ymin,

            id: -1,
            classe: "obstaculo",
            nomePt: "Obstáculo",
            score: 1,

            distanciaM: null,
            valorProfundidade: valor,
            direcao: zona.nome,

            muitoProximo
        });
    }

    return deteccoes;
}


/* =====================================================================
   FUNÇÃO PRINCIPAL (a única usada por fora)
   ===================================================================== */

export async function deteccao(canvas) {

    console.time("processamento");

    const deteccoes = await detectarComYolo(canvas);

    const yoloJaAchouPerigo =
        deteccoes.some((d) => d.muitoProximo);

    // Se o YOLO já achou algo perigoso, não gasta tempo com a profundidade.
    if (estimadorProfundidade && !yoloJaAchouPerigo) {

        try {

            const porProfundidade =
                await detectarComProfundidade(canvas);

            deteccoes.push(...porProfundidade);

        } catch (erro) {

            console.error("Erro na profundidade:", erro);
        }
    }

    console.timeEnd("processamento");

    return deteccoes;
}
