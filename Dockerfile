# BFF image: auth + YARP proxy to assistant-api / comms-api. The SPA joins this image when it lands
# (cal-web pattern: build the client, serve from wwwroot). Build context = repo root.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/LupiraAssistantBff/ ./LupiraAssistantBff/
WORKDIR /src/LupiraAssistantBff
ARG BUILD_CONFIGURATION=Release
RUN dotnet restore "./LupiraAssistantBff.csproj"
RUN dotnet publish "./LupiraAssistantBff.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

ENV ASPNETCORE_URLS=http://+:80
COPY --from=build /app/publish .
USER app

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:80/livez || exit 1
ENTRYPOINT ["dotnet", "LupiraAssistantBff.dll"]
