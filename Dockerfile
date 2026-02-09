FROM node:20

# Installation des dépendances système
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Création du dossier de travail
WORKDIR /app

# Copie des fichiers
COPY package.json .
RUN npm install
COPY . .

# Port pour le maintien en vie
EXPOSE 7860
ENV PORT=7860

# Lancement du bot
CMD ["node", "fuit.js"]
