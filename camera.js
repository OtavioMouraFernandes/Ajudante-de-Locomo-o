const video =
    document.getElementById("video");


const constraints = {

    video: {

        width: {
            ideal: 1920
        },

        height: {
            ideal: 1080
        }
    },

    audio: false
};



async function startStream() {

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia(
                constraints
            );


        video.srcObject =
            stream;


        await video.play();


        // Permite que outros módulos
        // acessem o vídeo.
        window.video =
            video;


        console.log(
            "Câmera iniciada."
        );


    } catch (erro) {

        console.error(
            "Não foi possível acessar a câmera:",
            erro
        );
    }
}



if (
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
) {

    startStream();

} else {

    alert(
        "Seu navegador não suporta acesso à câmera."
    );
}