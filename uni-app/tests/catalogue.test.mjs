/** 青穗集 · 目录故障回归：核对请求边界、异步失败处理和微信组件样式。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";
import { parse as parseVue } from "@vue/compiler-sfc";
import * as sass from "sass";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const source = await readFile(
    new URL("../src/services/api.ts", import.meta.url),
    "utf8",
);
const output = ts
    .transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    })
    .outputText.replace(
        /import\.meta\.env\.VITE_AGENT_API_ORIGIN/g,
        "undefined",
    );
const api = await import(
    "data:text/javascript;base64," + Buffer.from(output).toString("base64")
);

function pendingRequest() {
    let callback;
    const actions = [];
    globalThis.uni = {
        getStorageSync: () => "fixture-token",
        removeStorageSync: () => actions.push("clear-token"),
        reLaunch: (options) => actions.push(options.url),
        request: (options) => {
            callback = options;
        },
    };
    globalThis.getCurrentPages = () => [{ route: "pages/directions/index" }];
    const promise = api.request("/api/v1/agent/career/catalogue/directions");
    return { promise, callback, actions };
}

test("异步 400 回调正常拒绝请求，保留服务端原因和错误码", async () => {
    const { promise, callback, actions } = pendingRequest();
    const rejection = assert.rejects(promise, (error) => {
        assert.ok(api.isAgentApiError(error));
        assert.equal(error.status, 400);
        assert.equal(error.code, "invalid_input");
        assert.equal(error.message, "输入格式不符合要求");
        return true;
    });
    await Promise.resolve();
    assert.doesNotThrow(() =>
        callback.success({
            statusCode: 400,
            data: { detail: "输入格式不符合要求", code: "invalid_input" },
        }),
    );
    await rejection;
    assert.deepEqual(actions, []);
});

test("空错误响应和网络失败都能结束等待", async () => {
    for (const network of [false, true]) {
        const { promise, callback } = pendingRequest();
        const rejection = assert.rejects(promise, (error) => {
            assert.ok(api.isAgentApiError(error));
            assert.equal(error.status, network ? 0 : 503);
            assert.equal(
                error.message,
                network ? "request:fail timeout" : "请求失败（503）",
            );
            return true;
        });
        await Promise.resolve();
        assert.doesNotThrow(() =>
            network
                ? callback.fail({ errMsg: "request:fail timeout" })
                : callback.success({ statusCode: 503, data: null }),
        );
        await rejection;
    }
    assert.equal(api.isAgentApiError(new Error("普通异常")), false);
    assert.equal(api.isAgentApiError(null), false);
});

test("401 清理令牌并返回登录页，登录页自身不重复跳转", async () => {
    for (const onAuth of [false, true]) {
        const { promise, callback, actions } = pendingRequest();
        if (onAuth)
            globalThis.getCurrentPages = () => [{ route: "pages/auth/index" }];
        const rejection = assert.rejects(
            promise,
            (error) => api.isAgentApiError(error) && error.status === 401,
        );
        await Promise.resolve();
        assert.doesNotThrow(() =>
            callback.success({
                statusCode: 401,
                data: { detail: "请重新登录" },
            }),
        );
        await rejection;
        assert.deepEqual(
            actions,
            onAuth ? ["clear-token"] : ["clear-token", "/pages/auth/index"],
        );
    }
});

test("方向和岗位请求遵循真实接口上限，搜索词保留", async () => {
    const requested = [];
    globalThis.uni = {
        getStorageSync: () => "fixture-token",
        request(options) {
            const url = new URL(options.url);
            requested.push(url);
            const maximum = url.pathname.endsWith("directions") ? 25 : 5;
            const limit = Number(url.searchParams.get("limit"));
            queueMicrotask(() =>
                options.success({
                    statusCode: limit >= 1 && limit <= maximum ? 200 : 400,
                    data: {},
                }),
            );
        },
    };
    await api.careerApi.directions({ query: "产品 & 数据", limit: 50 });
    await api.careerApi.jobs({
        directionCode: "product",
        city: "上海",
        limit: 20,
    });
    await api.careerApi.jobs({ limit: 0 });
    await api.careerApi.directions({ limit: 2.9 });
    assert.deepEqual(
        requested.map((url) => url.searchParams.get("limit")),
        ["25", "5", "1", "2"],
    );
    assert.equal(requested[0].searchParams.get("query"), "产品 & 数据");
    assert.equal(requested[1].searchParams.get("direction_code"), "product");
    assert.equal(requested[1].searchParams.get("city"), "上海");
});

test("未指定或无效的数量使用服务端默认值", async () => {
    const requested = [];
    globalThis.uni = {
        getStorageSync: () => "fixture-token",
        request(options) {
            requested.push(new URL(options.url));
            options.success({ statusCode: 200, data: {} });
        },
    };
    await api.careerApi.directions();
    await api.careerApi.jobs({ limit: NaN });
    await api.careerApi.directions({ limit: Infinity });
    assert.ok(requested.every((url) => !url.searchParams.has("limit")));
});

test("共享组件样式不包含微信禁止的标签、ID或属性选择器", async () => {
    const directory = new URL("../src/components/", import.meta.url);
    // uni-app 构建会向组件注入 uni.scss；独立编译也使用相同设计变量和 mixin。
    const designTokens = await readFile(new URL("../src/uni.scss", import.meta.url), "utf8");
    const invalid = [];
    for (const file of await readdir(directory)) {
        if (!file.endsWith(".vue")) continue;
        const source = await readFile(new URL(file, directory), "utf8");
        const { descriptor, errors } = parseVue(source, { filename: file });
        assert.deepEqual(errors, []);
        for (const style of descriptor.styles) {
            const css = sass.compileString(designTokens + "\n" + style.content).css;
            postcss.parse(css).walkRules((rule) => {
                if (
                    rule.parent.type === "atrule" &&
                    /keyframes$/.test(rule.parent.name)
                )
                    return;
                selectorParser((selectors) => {
                    selectors.walk((node) => {
                        if (
                            ["tag", "id", "attribute", "universal"].includes(
                                node.type,
                            )
                        )
                            invalid.push(file + ": " + rule.selector);
                    });
                }).processSync(rule.selector);
            });
        }
    }
    assert.deepEqual(invalid, []);
});
