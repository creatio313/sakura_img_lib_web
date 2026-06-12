FROM golang:1.23 AS build

WORKDIR /go/src/app
COPY docker/go.mod docker/go.sum* ./
RUN go mod download
COPY docker/ ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /go/bin/app ./cmd/server

FROM gcr.io/distroless/base-debian13:nonroot-amd64
COPY --from=build /go/bin/app /app
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/app"]