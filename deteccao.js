import {
    AutoModel,
    AutoProcessor,
    RawImage
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";


const modelo = "onnx-community/yolov10n";

const LIMIAR_CONFIANCA = 0.6;
const TAMANHO_LIMITE = 250;


console.log("Carregando YOLO...");

console.time("carregarmodelo");

const model =
    await AutoModel.from_pretrained(modelo);

const processor =
    await AutoProcessor.from_pretrained(modelo);

console.timeEnd("carregarmodelo");

console.log("YOLO carregado.");


export async function deteccao(canvas) {

    console.time("processamento");

    const imagem =
        await RawImage.fromCanvas(canvas);

    const imagemProcessada =
        await processor(imagem);

    const { output0 } =
        await model({
            images: imagemProcessada.pixel_values
        });


    const resultadoLista =
        output0.tolist()[0];

    const [alturaProcessada, larguraProcessada] =
        imagemProcessada.reshaped_input_sizes[0];

    const escalaX = imagem.width / larguraProcessada;
    const escalaY = imagem.height / alturaProcessada;

let deteccoes = [];

console.log(
    "Quantidade de resultados brutos:",
    resultadoLista.length
);

for (const [
    xminBruto,
    yminBruto,
    xmaxBruto,
    ymaxBruto,
    score,
    id
] of resultadoLista) {

    const classe =
        model.config.id2label[id];

    console.log(
        `RAW -> ${classe} | score: ${score.toFixed(4)}`
    );


    if (score < LIMIAR_CONFIANCA) {
        continue;
    }

    const xmin = xminBruto * escalaX;
    const ymin = yminBruto * escalaY;
    const xmax = xmaxBruto * escalaX;
    const ymax = ymaxBruto * escalaY;

    const altura =
        ymax - ymin;

    const largura =
        xmax - xmin;


    const muitoProximo =
        altura > TAMANHO_LIMITE ||
        largura > TAMANHO_LIMITE;


    console.log(
        `✅ ACEITO -> ${classe} | ` +
        `Confiança: ${score.toFixed(4)} | ` +
        `Largura: ${largura.toFixed(2)} | ` +
        `Altura: ${altura.toFixed(2)} | ` +
        `Muito próximo: ${muitoProximo}`
    );


    deteccoes.push({

        xmin,
        ymin,
        xmax,
        ymax,

        altura,
        largura,

        id,
        classe,
        score,

        muitoProximo
    });
}
    console.timeEnd("processamento");

    return deteccoes;
}