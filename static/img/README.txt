Pasta para imagens do projeto (logos, ícones, favicon, etc.).

Atualmente a interface usa emojis como ícones, então nenhuma imagem é
obrigatória. Coloque aqui qualquer arquivo .png/.svg que você quiser usar
e referencie no HTML com:

    {{ url_for('static', filename='img/seu-arquivo.png') }}
