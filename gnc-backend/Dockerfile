# gnc-backend multi-stage Dockerfile
# Stage 1: build with Conan + CMake
# Stage 2: stripped runtime image with only the binary + config

# -------- builder --------
FROM ubuntu:24.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 python3-pip git \
        cmake ninja-build build-essential pkg-config \
        libssl-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir "conan>=2.0"

WORKDIR /src
COPY . /src/gnc-backend
COPY ../gnc-core /src/gnc-core

RUN cd /src/gnc-backend && \
    conan profile detect --force && \
    conan install . --output-folder=build --build=missing \
                    -s build_type=Release \
                    -s compiler.cppstd=20 && \
    cmake -S . -B build -G Ninja \
          -DCMAKE_TOOLCHAIN_FILE=build/conan_toolchain.cmake \
          -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build -j

# -------- runtime --------
FROM ubuntu:24.04 AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 zlib1g \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /src/gnc-backend/build/gnc-backend /app/gnc-backend
COPY --from=builder /src/gnc-backend/config /app/config

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8080/api/v1/health || exit 1

ENTRYPOINT ["/app/gnc-backend", "/app/config/prod.json"]
