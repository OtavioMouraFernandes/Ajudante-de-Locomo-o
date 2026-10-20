import { deteccao } from "./deteccao.js";


const canvas =
    document.getElementById("framesYolo");

const ctxYolo =
    canvas.getContext("2d");


const canvasComparacao =
    document.getElementById("frames");

const ctxComparacao =
    canvasComparacao.getContext(
        "2d",
        { willReadFrequently: true }
    );


/* =====================================================================
   CONFIGURAÇÕES
   ===================================================================== */

// false = analisa continuamente, o mais rápido que o aparelho aguentar
//         (mais seguro para quem anda).
// true  = só analisa quando a imagem muda bastante (economiza bateria),
//         mas pode "perder" um obstáculo que se aproxima devagar.
const USAR_COMPARACAO_FRAMES = false;

// Só vale com USAR_COMPARACAO_FRAMES = true.
// Diferença média de brilho (0-255) entre dois frames para considerar "mudou".
// O valor antigo (13) era alto demais; 5 é um ponto de partida melhor.
const MARGEM_ERRO = 5;

// Só vale com USAR_COMPARACAO_FRAMES = true.
// Mesmo sem mudança, analisa de novo depois deste tempo (ms).
const INTERVALO_FORCADO_MS = 1500;

// Pausa entre uma análise e outra (ms).
const INTERVALO_MONITORAMENTO = 100;

// Tempo entre os dois frames comparados (ms). Só vale com comparação ligada.
const TEMPO_ENTRE_FRAMES = 200;

// Quantas análises seguidas precisam ver o obstáculo para falar.
// 1 = alerta imediato (mais falsos alarmes). 2 = mais confiável.
const FRAMES_PARA_CONFIRMAR = 2;

// Se o obstáculo continuar na frente, repete o aviso a cada X ms.
const INTERVALO_REPETIR_ALERTA_MS = 3000;


/* =====================================================================
   ESTADO
   ===================================================================== */

// Referência ao elemento de vídeo. Só é preenchida
// depois que a câmera estiver pronta (ver esperarCamera).
let video;

// Evita duas inferências simultâneas
let processandoYolo = false;

// Indica que há um alerta em andamento (obstáculo ainda na frente)
let alertaAtivo = false;

// Indica se a primeira detecção já foi executada
let primeiraDeteccaoRealizada = false;

// Quantas análises seguidas viram obstáculo próximo
let framesConsecutivosPerto = 0;

// Momento (ms) do último aviso falado
let ultimoAlertaEm = 0;

// Momento (ms) da última análise concluída
let ultimaExecucaoEm = 0;


function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}


/* =====================================================================
   VOZ
   ===================================================================== */

// Navegadores de celular só liberam a voz depois de um toque do usuário.
// Este "toque qualquer" na tela destrava a fala.
function desbloquearVoz() {

    if ("speechSynthesis" in window) {

        const mudo =
            new SpeechSynthesisUtterance("");

        mudo.volume = 0;

        speechSynthesis.speak(mudo);
    }
}

["click", "touchstart", "keydown"].forEach(evento =>
    document.addEventListener(
        evento,
        desbloquearVoz,
        { once: true }
    )
);


function falar(texto) {

    if (!("speechSynthesis" in window)) {

        console.log("Speech Synthesis não disponível.");
        return;
    }

    speechSynthesis.cancel();

    const fala =
        new SpeechSynthesisUtterance(texto);

    fala.lang = "pt-BR";
    fala.rate = 1.1;
    fala.volume = 1;

    speechSynthesis.speak(fala);
}


/* =====================================================================
   CÂMERA E COMPARAÇÃO DE FRAMES
   ===================================================================== */

async function esperarCamera() {

    while (
        !window.video ||
        !window.video.videoWidth ||
        !window.video.videoHeight
    ) {

        await sleep(100);
    }


    // Só agora a câmera existe de verdade -
    // guarda a referência na variável do módulo.
    video = window.video;


    console.log(
        "Câmera pronta:",
        window.video.videoWidth,
        "x",
        window.video.videoHeight
    );


    // Usa a resolução real da câmera
    canvas.width =
        window.video.videoWidth;

    canvas.height =
        window.video.videoHeight;


    canvasComparacao.width =
        window.video.videoWidth;

    canvasComparacao.height =
        window.video.videoHeight;
}


function capturarFrameComparacao() {

    ctxComparacao.filter =
        "grayscale(100%)";


    ctxComparacao.drawImage(
        video,
        0,
        0,
        canvasComparacao.width,
        canvasComparacao.height
    );


    return ctxComparacao.getImageData(
        0,
        0,
        canvasComparacao.width,
        canvasComparacao.height
    );
}


async function compararFrames() {

    const primeiroFrame =
        capturarFrameComparacao();


    await sleep(TEMPO_ENTRE_FRAMES);


    const segundoFrame =
        capturarFrameComparacao();


    const pixels1 =
        primeiroFrame.data;

    const pixels2 =
        segundoFrame.data;


    let diferencaTotal = 0;


    // Cada pixel ocupa 4 posições (R,G,B,A). Pulando de 16 em 16,
    // analisamos 1 a cada 4 pixels (basta o canal R, pois a imagem é cinza).
    for (
        let i = 0;
        i < pixels1.length;
        i += 16
    ) {

        diferencaTotal +=
            Math.abs(pixels1[i] - pixels2[i]);
    }


    const quantidadeAmostras =
        Math.ceil(pixels1.length / 16);


    const diferencaMedia =
        diferencaTotal / quantidadeAmostras;


    console.log(
        "Diferença média:",
        diferencaMedia.toFixed(2)
    );


    return diferencaMedia;
}


/* =====================================================================
   DETECÇÃO
   ===================================================================== */

// (O nome "executarYolo" foi mantido, mas agora roda YOLO + profundidade.)
async function executarYolo() {

    if (processandoYolo) {
        return;
    }


    processandoYolo = true;


    try {

        // Captura o frame colorido
        ctxYolo.filter = "none";

        ctxYolo.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );


        console.log("Executando detecção...");


        const deteccoes =
            await deteccao(canvas);


        verificarProximidade(deteccoes);


        if (!primeiraDeteccaoRealizada) {

            primeiraDeteccaoRealizada = true;

            falar("Sistema pronto.");
        }


    } catch (erro) {

        console.error(
            "Erro na detecção:",
            erro
        );

    } finally {

        processandoYolo = false;

        ultimaExecucaoEm = Date.now();
    }
}


function verificarProximidade(deteccoes) {

    const proximos =
        deteccoes.filter(objeto => objeto.muitoProximo);


    // Caminho livre: zera tudo para o próximo obstáculo avisar na hora.
    if (proximos.length === 0) {

        console.log("Não há objeto próximo");

        framesConsecutivosPerto = 0;
        alertaAtivo = false;
        ultimoAlertaEm = 0;

        return;
    }


    framesConsecutivosPerto++;


    // Escolhe o mais perigoso: menor distância conhecida primeiro.
    // Quem não tem distância (profundidade) fica por último.
    proximos.sort((a, b) =>
        (a.distanciaM ?? 99) - (b.distanciaM ?? 99)
    );

    const alvo = proximos[0];


    console.log(
        "⚠️ OBSTÁCULO PRÓXIMO:",
        alvo.classe,
        "| origem:", alvo.origem,
        "| direção:", alvo.direcao,
        "| confirmações:", framesConsecutivosPerto
    );


    // Ainda não confirmou em análises suficientes (evita falso alarme).
    if (framesConsecutivosPerto < FRAMES_PARA_CONFIRMAR) {
        return;
    }


    const agora = Date.now();

    if (
        !alertaAtivo ||
        agora - ultimoAlertaEm >= INTERVALO_REPETIR_ALERTA_MS
    ) {

        emitirAlerta(alvo);
    }
}


function montarFrase(alvo) {

    const lugar = {
        esquerda: "à esquerda",
        frente: "à frente",
        direita: "à direita"
    }[alvo.direcao] || "à frente";


    if (alvo.origem === "yolo") {

        let distancia = "";

        if (alvo.distanciaM !== null) {

            // Arredonda para múltiplos de 0,5 m ("1,5 metros").
            const metros =
                (Math.round(alvo.distanciaM * 2) / 2)
                    .toString()
                    .replace(".", ",");

            distancia = `, a cerca de ${metros} metros`;
        }

        return `Atenção. ${alvo.nomePt} ${lugar}${distancia}.`;
    }

    return `Atenção. Obstáculo muito próximo ${lugar}.`;
}


function emitirAlerta(alvo) {

    alertaAtivo = true;
    ultimoAlertaEm = Date.now();


    const frase = montarFrase(alvo);

    console.log("🚨 ALERTA EMITIDO:", frase);


    falar(frase);


    if ("vibrate" in navigator) {

        navigator.vibrate([300, 150, 300]);

    } else {

        console.log(
            "Vibração não suportada neste navegador."
        );
    }
}


/* =====================================================================
   LAÇO PRINCIPAL
   ===================================================================== */

export async function IniciarMonitoramento() {

    console.log("Monitoramento iniciado.");


    await esperarCamera();

    console.log("Realizando primeira detecção...");


    await executarYolo();


    while (true) {

        try {

            let deveExecutar = true;


            if (USAR_COMPARACAO_FRAMES) {

                const diferenca =
                    await compararFrames();

                const tempoParado =
                    Date.now() - ultimaExecucaoEm;

                deveExecutar =
                    diferenca > MARGEM_ERRO ||
                    tempoParado > INTERVALO_FORCADO_MS;
            }


            if (deveExecutar && !processandoYolo) {

                await executarYolo();
            }


        } catch (erro) {

            console.error(
                "Erro no monitoramento:",
                erro
            );

            await sleep(1000);
        }


        await sleep(INTERVALO_MONITORAMENTO);
    }
}


IniciarMonitoramento();
