FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/api ./cmd/api

FROM alpine:3.20
# poppler-utils é o fallback de extração de PDF quando o leitor em Go puro
# não dá conta — ver o plano, seção de ingestão.
RUN apk add --no-cache ca-certificates poppler-utils tzdata
ENV TZ=America/Sao_Paulo
COPY --from=build /bin/api /bin/api
EXPOSE 8080
ENTRYPOINT ["/bin/api"]
