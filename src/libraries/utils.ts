import * as http from "http";
import * as https from "https";

import { Request } from "express";

import * as ProxyAgent from "proxy-agent";

interface IRequestOptions {
    protocol: string;
    hostname: string;
    path: string;
    port: number;
    method: string;
    data?: any;
    queries?: string|object;
    proxy?: string;
    abortSignal?: AbortSignal;
    readonly [propName: string]: string|number|object|undefined|boolean;
}

const request = (options: IRequestOptions) => new Promise<object>((resolve, reject) => {
    const client = (() => {
        switch (options.protocol) {
            case "http":
                return http;
            case "https":
            default:
                return https;
        }
    })();

    const dataStr = (() => {
        const data = options.data;

        if (!data) {
           return "";
        }

        if (options.method.toUpperCase() === "POST") {
            switch (typeof data) {
                case "string":
                    return data;
                case "object":
                    return JSON.stringify(data);
                default:
                    return "";
            }
        } else if (options.method.toUpperCase() === "GET") {
            switch (typeof data) {
                case "string":
                    return data;
                case "object":
                    return Object.entries(data)
                        .filter((entry) => entry.reduce((total, el) => total && el, true))
                        .map((entry) => entry.join("="))
                        .join("&");
                default:
                    return "";
            }
        }

        return "";
    })();

    const queries = (() => {
        if (typeof options.queries === "object") {
            Object.entries(options.queries)
                .filter((entry) => entry.reduce((total, el) => total && el, true))
                .map((entry) => entry.join("="))
                .join("&");
        }

        return "";
    })();

    const requestOptions: any = {
        ...options,
        path: (() => {
            if (options.method.toUpperCase() === "GET") {
                return options.path + "?" + encodeURI([dataStr, queries].filter((queryStr) => queryStr).join("&"));
            } else if (queries) {
                return options.path + "?" + encodeURI(queries);
            }

            return options.path;
        })(),
        protocol: options.protocol + ":",
    };

    if (options.proxy) {
        requestOptions.agent = new ProxyAgent(options.proxy);
    }

    const req = client.request(requestOptions, (res: http.IncomingMessage) => {
        // @ts-ignore
        res.setEncoding("utf8");

        let data = "";

        res.on("data", (chunk) => {
            data += chunk;
        });

        res.on("end", () => {
            try {
                const parsedData = JSON.parse(data);

                resolve(parsedData);
            } catch (e) {
                reject(e);
            }
        });
    });

    if (options.abortSignal) {
        options.abortSignal.addEventListener("abort", () => {
            if (req.aborted) {
                return;
            }

            req.abort();
        });
    }

    req.on("error", (e: Error) => {
        reject(e);
    });

    if (options.method.toUpperCase() === "POST") {
        req.write(dataStr);
    }

    req.end();
});

const getClientIp = (req: Request) => {
    return req.headers["x-forwarded-for"]
        || req.connection.remoteAddress
        || req.socket.remoteAddress
        || req.connection.remoteAddress
        || req.ip;
};

export { request, getClientIp };