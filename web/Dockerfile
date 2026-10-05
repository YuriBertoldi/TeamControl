# Frontend do TeamControl.
#
# Dois estágios: o Node compila, o nginx serve. A imagem final não carrega
# Node nem node_modules — são ~300 MB que não têm o que fazer em produção, e
# cada dependência a mais no runtime é superfície de ataque num sistema que
# guarda dado de RH.
#
# O `VITE_API` é resolvido em tempo de BUILD, não de execução: o Vite substitui
# `import.meta.env` no bundle. Por isso ele entra como build-arg, e trocar a
# URL da API exige rebuildar a imagem — não adianta mexer em variável de
# ambiente do container depois.
FROM node:22-alpine AS build
WORKDIR /app

# package.json primeiro: a camada de dependências só é refeita quando elas
# mudam, e não a cada alteração de código.
COPY package*.json ./
RUN npm ci

COPY . .

# O browser fala com a API pelo host, não pela rede do compose: o JavaScript
# roda na máquina de quem abre a página, e lá dentro "api" não resolve.
ARG VITE_API=http://127.0.0.1:8080
ENV VITE_API=$VITE_API
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
