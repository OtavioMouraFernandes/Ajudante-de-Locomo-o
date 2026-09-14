import { deteccao } from "./deteccao.js";


const canvas =
    document.getElementById("framesYolo");

const ctxYolo =
    canvas.getContext("2d");


const canvasComparacao =
    document.getElementById("frames");

const ctxComparacao =
    canvasComparacao.getContext("2d");


const MARGEM_ERRO = 13;

const INTERVALO_MONITORAMENTO = 300;

const TEMPO_ENTRE_FRAMES = 200;


// Referência ao elemento de vídeo. Só é preenchida
// depois que a câmera estiver pronta (ver esperarCamera).
let video;


// Evita duas inferências simultâneas
let processandoYolo = false;


// Impede ficar falando sem parar
let alertaAtivo = false;


// Indica se o primeiro YOLO já foi executado
let primeiraDeteccaoRealizada = false;



function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}



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


    /*
        Em vez de analisar todos os pixels,
        analisamos um a cada 4 pixels.
    */

    for (
        let i = 0;
        i < pixels1.length;
        i += 16
    ) {

        const diferenca =
            Math.abs(
                pixels1[i] -
                pixels2[i]
            );


        diferencaTotal += diferenca;
    }


    const quantidadeAmostras =
        Math.ceil(
            pixels1.length / 16
        );


    const diferencaMedia =
        diferencaTotal /
        quantidadeAmostras;


    console.log(
        "Diferença média:",
        diferencaMedia.toFixed(2)
    );


    return diferencaMedia;
}



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


        console.log(
            "Executando YOLO..."
        );


        const deteccoes =
            await deteccao(canvas);


        verificarProximidade(
            deteccoes
        );


        primeiraDeteccaoRealizada = true;


    } catch (erro) {

        console.error(
            "Erro no YOLO:",
            erro
        );

    } finally {

        processandoYolo = false;
    }
}

function verificarProximidade(deteccoes) {

    let encontrouObjetoProximo =
        false;


    for (const objeto of deteccoes) {

        console.log(
            `${objeto.classe} | ` +
            `largura: ${objeto.largura.toFixed(2)} | ` +
            `altura: ${objeto.altura.toFixed(2)} | ` +
            `muito próximo: ${objeto.muitoProximo}`
        );


        if (objeto.muitoProximo) {

            encontrouObjetoProximo =
                true;


            console.log(
                "⚠️ OBSTÁCULO MUITO PRÓXIMO:",
                objeto.classe
            );


            if (!alertaAtivo) {

                emitirAlerta();
            }


            break;
        }
    }

    if (!encontrouObjetoProximo) {

        alertaAtivo = false;
    }
}



function emitirAlerta() {

    alertaAtivo = true;


    console.log(
        "🚨 ALERTA EMITIDO"
    );


    // ==========================
    // VOZ
    // ==========================

    if (
        "speechSynthesis" in window
    ) {

        speechSynthesis.cancel();


        const fala =
            new SpeechSynthesisUtterance(
                "Atenção. Obstáculo muito próximo."
            );


        fala.lang =
            "pt-BR";

        fala.rate =
            1.1;

        fala.volume =
            1;


        speechSynthesis.speak(
            fala
        );

    } else {

        console.log(
            "Speech Synthesis não disponível."
        );
    }

    if (
        "vibrate" in navigator
    ) {

        navigator.vibrate([
            300,
            150,
            300
        ]);

    } else {

        console.log(
            "Vibração não suportada neste navegador."
        );
    }
}

export async function IniciarMonitoramento() {

    console.log(
        "Monitoramento iniciado."
    );


    await esperarCamera();

    console.log(
        "Realizando primeira detecção..."
    );


    await executarYolo();


    while (true) {

        try {

            const diferenca =
                await compararFrames();

            if (
                diferenca > MARGEM_ERRO &&
                !processandoYolo
            ) {

                console.log(
                    "Alteração significativa detectada."
                );


                await executarYolo();
            }


        } catch (erro) {

            console.error(
                "Erro no monitoramento:",
                erro
            );


            await sleep(1000);
        }


        await sleep(
            INTERVALO_MONITORAMENTO
        );
    }
}


IniciarMonitoramento();