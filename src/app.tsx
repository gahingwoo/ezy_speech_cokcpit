/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Switch } from "@patternfly/react-core/dist/esm/components/Switch/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Tabs, Tab } from "@patternfly/react-core/dist/esm/components/Tabs/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";
import { Toolbar, ToolbarContent, ToolbarItem, ToolbarGroup } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";
import { Dropdown, DropdownItem, DropdownList } from "@patternfly/react-core/dist/esm/components/Dropdown/index.js";
import { MenuToggle } from "@patternfly/react-core/dist/esm/components/MenuToggle/index.js";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { DescriptionList, DescriptionListGroup, DescriptionListTerm, DescriptionListDescription } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import CheckCircleIcon from "@patternfly/react-icons/dist/esm/icons/check-circle-icon";
import ExclamationCircleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-circle-icon";
import ExclamationTriangleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon";
import EllipsisVIcon from "@patternfly/react-icons/dist/esm/icons/ellipsis-v-icon";
import ExternalLinkAltIcon from "@patternfly/react-icons/dist/esm/icons/external-link-alt-icon";
import { proxy as serviceProxy } from "service.js";
import { superuser as superuserProxy } from "superuser.js";
import cockpit from "cockpit";

const _ = cockpit.gettext;

// ============================================
// UpdateButton 组件 - 一键更新
// ============================================

function UpdateButton() {
    const { allowed: hasPermission } = useSuperUserPermissions();
    const [modalOpen, setModalOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [output, setOutput] = useState<string[]>([]);
    const [exitStatus, setExitStatus] = useState<"success" | "danger" | null>(null);
    const outputEndRef = useRef<HTMLDivElement | null>(null);
    const spawnRef = useRef<any>(null);

    // Auto-scroll to bottom as output grows
    useEffect(() => {
        if (outputEndRef.current) {
            outputEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [output]);

    const runUpdate = useCallback(async () => {
        setOutput([]);
        setExitStatus(null);
        setRunning(true);
        setModalOpen(true);

        try {
            // 同时读取 WorkingDirectory 和 User 属性
            const showOut = await cockpit.spawn(
                ["systemctl", "show", "-p", "WorkingDirectory,User", "ezyspeech-admin.service"],
                { err: "out" }
            );

            const dirMatch = showOut.match(/WorkingDirectory=(.+)/);
            const userMatch = showOut.match(/User=(.+)/);

            if (!dirMatch || !dirMatch[1]) {
                setOutput(prev => [...prev, _("Error: unable to determine WorkingDirectory from systemctl")]);
                setExitStatus("danger");
                setRunning(false);
                return;
            }

            const workingDir = dirMatch[1].trim();
            const serviceUser = userMatch?.[1]?.trim() || null;
            const venvPython = `${workingDir}/venv/bin/python`;
            const updateScript = `${workingDir}/update.py`;

            // 构造命令：如果读到 User= 则用 sudo -u <user> 切换身份
            const cmd = serviceUser
                ? ["sudo", "-u", serviceUser, venvPython, updateScript]
                : [venvPython, updateScript];

            setOutput(prev => [...prev, `$ ${cmd.join(" ")}`, ""]);

            const proc = cockpit.spawn(
                cmd,
                { directory: workingDir, err: "out", superuser: "require" }
            );
            spawnRef.current = proc;

            proc.stream((data: string) => {
                if (data) {
                    setOutput(prev => {
                        const lines = data.split("\n");
                        return [...prev, ...lines.filter((_, i) => i < lines.length - 1 || lines[i] !== "")];
                    });
                }
            });

            proc.done(() => {
                setExitStatus("success");
                setOutput(prev => [...prev, "", _("✓ Update completed successfully.")]);
                setRunning(false);
                spawnRef.current = null;
            });

            proc.fail((err: any) => {
                const msg = cockpit.message(err) || _("Update failed");
                setOutput(prev => [...prev, "", `✗ ${msg}`]);
                setExitStatus("danger");
                setRunning(false);
                spawnRef.current = null;
            });
        } catch (ex) {
            const msg = ex instanceof Error ? ex.message : String(ex);
            setOutput(prev => [...prev, `✗ ${msg}`]);
            setExitStatus("danger");
            setRunning(false);
        }
    }, []);

    const handleClose = () => {
        if (spawnRef.current) {
            try { spawnRef.current.close(); } catch (_) { /* ignore */ }
            spawnRef.current = null;
        }
        setModalOpen(false);
        setRunning(false);
    };

    return (
        <>
            <Button
                variant="primary"
                isDisabled={!hasPermission || running}
                isLoading={running}
                onClick={runUpdate}
                style={{ borderRadius: "var(--pf-v6-c-button--BorderRadius, 4px)" }}
            >
                {running ? _("Updating...") : _("Update")}
            </Button>

            <Modal
                isOpen={modalOpen}
                onClose={handleClose}
                variant="large"
                aria-labelledby="update-modal-title"
            >
                <ModalHeader
                    title={_("Update EzySpeech")}
                    labelId="update-modal-title"
                />
                <ModalBody>
                    {running && (
                        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "1rem" }}>
                            <FlexItem><Spinner size="md" aria-label={_("Running update")} /></FlexItem>
                            <FlexItem><span style={{ color: "var(--pf-t--global--text--color--subtle, #6a6e73)" }}>{_("Running update script, please wait...")}</span></FlexItem>
                        </Flex>
                    )}
                    {exitStatus === "success" && (
                        <Alert variant="success" isInline title={_("Update completed successfully")} style={{ marginBottom: "1rem" }} />
                    )}
                    {exitStatus === "danger" && (
                        <Alert variant="danger" isInline title={_("Update failed")} style={{ marginBottom: "1rem" }} />
                    )}
                    <pre style={{
                        background: "var(--pf-v6-c-code-block__code--BackgroundColor, #1f1f1f)",
                        color: "var(--pf-v6-c-code-block__code--Color, #fff)",
                        padding: "var(--pf-t--global--spacer--lg, 24px)",
                        borderRadius: "var(--pf-v6-c-code-block--BorderRadius, 4px)",
                        border: "1px solid var(--pf-v6-c-code-block--BorderColor, #333)",
                        maxHeight: "400px",
                        overflowY: "auto",
                        fontSize: "0.75rem",
                        lineHeight: "1.6",
                        fontFamily: "'Courier New', monospace",
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                    }}>
                        {output.join("\n")}
                        <div ref={outputEndRef} />
                    </pre>
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant={running ? "secondary" : "primary"}
                        onClick={handleClose}
                    >
                        {running ? _("Cancel") : _("Close")}
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
}

// ============================================
// 1. 类型定义
// ============================================

type ServiceKey = "admin" | "user";
type ServiceTabKey = "logs" | "config" | "debug";

type CockpitServiceProxy = ReturnType<typeof serviceProxy> & {
    addEventListener?: (event: string, callback: () => void) => void;
    removeEventListener?: (event: string, callback: () => void) => void;
};

interface ServiceInfo {
    key: ServiceKey;
    unit: string;
    title: string;
}

// ============================================
// 权限常量
// ============================================

const PERMISSION_ERRORS = {
    START_STOP: _("You do not have permission to start or stop services. Administrator access required."),
    ENABLE_DISABLE: _("You do not have permission to enable or disable services. Administrator access required."),
    VIEW_LOGS: _("You do not have permission to view system logs. Administrator access required."),
};

// ============================================
// 2. 常量定义
// ============================================

const SERVICES: ServiceInfo[] = [
    { key: "admin", unit: "ezyspeech-admin.service", title: _("EzySpeech Admin") },
    { key: "user", unit: "ezyspeech-user.service", title: _("EzySpeech User") },
];

const PREVIEW_LOG_LINES = 100;

// ============================================
// 权限检查 Hook
// ============================================

function useSuperUserPermissions() {
    const superuser = useMemo(() => superuserProxy, []);
    const [allowed, setAllowed] = useState(superuser.allowed === true);

    useEffect(() => {
        const updateAllowed = () => setAllowed(superuser.allowed === true);
        const proxyWithEvents = superuser as any;

        if (proxyWithEvents.addEventListener) {
            proxyWithEvents.addEventListener("changed", updateAllowed);
            return () => {
                if (proxyWithEvents.removeEventListener) {
                    proxyWithEvents.removeEventListener("changed", updateAllowed);
                }
            };
        }
    }, [superuser]);

    return { allowed, needsAuth: superuser.allowed === false };
}

// ============================================
// 实时日志流（使用 cockpit.spawn + 节流机制）
// ============================================

function useWebSocketLogStream(unit: string, enabled: boolean = true) {
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const spawnRef = useRef<any>(null);
    const updateQueueRef = useRef<string[]>([]);
    const lastUpdateTimeRef = useRef<number>(0);
    const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const closeStream = useCallback(() => {
        if (spawnRef.current) {
            try {
                spawnRef.current.close();
            } catch (e) {
                // ignore
            }
            spawnRef.current = null;
        }
        if (updateTimerRef.current) {
            clearTimeout(updateTimerRef.current);
            updateTimerRef.current = null;
        }
        setIsStreaming(false);
    }, []);

    // 节流更新函数：将多个日志合并后统一更新
    const flushUpdates = useCallback(() => {
        if (updateQueueRef.current.length > 0) {
            setLogs(prevLogs => {
                // 合并新增的日志，去除重复
                const allLogs = [...prevLogs];
                for (const newLog of updateQueueRef.current) {
                    if (!allLogs.includes(newLog)) {
                        allLogs.push(newLog);
                    }
                }
                // 只保持最近的 1000 行，避免内存过大
                return allLogs.slice(Math.max(0, allLogs.length - 1000));
            });
            updateQueueRef.current = [];
            lastUpdateTimeRef.current = Date.now();
        }
    }, []);

    const openStream = useCallback(() => {
        if (!enabled || !unit) return;

        closeStream();
        setError(null);
        setIsStreaming(true);
        setLogs([]);
        updateQueueRef.current = [];

        try {
            // 使用 cockpit.spawn 执行 journalctl 获取实时日志
            const spawn = cockpit.spawn(
                ["journalctl", "-u", unit, "-n", "100", "-o", "short"],
                { err: "message" }
            );

            let initialOutput = "";

            // 收集初始输出
            spawn.stream((data: string) => {
                if (data) {
                    initialOutput += data;
                }
            });

            // 处理完成 - 显示初始日志
            spawn.done(() => {
                const lines = initialOutput
                    .split("\n")
                    .filter(l => l.trim());
                setLogs(lines);
                setIsStreaming(false);
                setError(null);
            });

            // 处理错误
            spawn.fail((error: any) => {
                const errorMsg = cockpit.message(error) || _("Failed to load logs");
                setError(errorMsg);
                setIsStreaming(false);
            });

            spawnRef.current = spawn;

            // 定期轮询获取最新日志（每 2 秒）
            const pollInterval = setInterval(() => {
                if (!enabled || !unit) {
                    clearInterval(pollInterval);
                    return;
                }

                try {
                    const pollSpawn = cockpit.spawn(
                        ["journalctl", "-u", unit, "-n", "100", "-o", "short"],
                        { err: "message" }
                    );

                    let pollOutput = "";

                    pollSpawn.stream((data: string) => {
                        if (data) {
                            pollOutput += data;
                        }
                    });

                    pollSpawn.done(() => {
                        const newLines = pollOutput
                            .split("\n")
                            .filter(l => l.trim());

                        // 将新日志添加到队列，而不是直接更新 State
                        if (newLines.length > 0) {
                            updateQueueRef.current = newLines;
                        }

                        // 使用节流机制：最多每 200ms 更新一次 UI
                        const now = Date.now();
                        if (now - lastUpdateTimeRef.current >= 200) {
                            // 立即更新
                            flushUpdates();
                        } else {
                            // 延迟更新
                            if (updateTimerRef.current) {
                                clearTimeout(updateTimerRef.current);
                            }
                            updateTimerRef.current = setTimeout(() => {
                                flushUpdates();
                            }, 200);
                        }
                    });

                    pollSpawn.fail(() => {
                        // 轮询失败，不中断，继续下一次
                    });
                } catch (e) {
                    // 轮询异常，不中断，继续下一次
                }
            }, 2000);

            return () => clearInterval(pollInterval);
        } catch (ex) {
            const errorMsg = ex instanceof Error ? ex.message : String(ex);
            setError(errorMsg);
            setIsStreaming(false);
        }
    }, [unit, enabled, closeStream, flushUpdates]);

    useEffect(() => {
        if (enabled && unit) {
            return openStream();
        }
        return closeStream;
    }, [enabled, unit, openStream, closeStream]);

    const clearLogs = useCallback(() => setLogs([]), []);
    return { logs, error, isStreaming, reconnect: openStream, clearLogs };
}

// ============================================
// 3. 状态label映射 - PFv6风格
// ============================================

function stateLabel(state: unknown): {
    text: string;
    status: "success" | "danger" | "warning" | "info" | "custom";
} {
    switch (state) {
        case "running":
            return { text: _("Running"), status: "success" };
        case "stopped":
            return { text: _("Stopped"), status: "info" };
        case "failed":
            return { text: _("Failed"), status: "danger" };
        case "starting":
            return { text: _("Starting"), status: "warning" };
        case "stopping":
            return { text: _("Stopping"), status: "warning" };
        default:
            return { text: _("Unknown"), status: "info" };
    }
}

// ============================================
// 4. Hook: 监听服务状态变化
// ============================================

function useServiceUpdates(proxy: CockpitServiceProxy) {
    const [, bump] = useState(0);
    const refresh = useCallback(() => bump(n => n + 1), []);

    useEffect(() => {
        const proxyWithEvents = proxy as any;
        if (proxyWithEvents.addEventListener) {
            proxyWithEvents.addEventListener("changed", refresh);
            return () => {
                if (proxyWithEvents.removeEventListener) {
                    proxyWithEvents.removeEventListener("changed", refresh);
                }
            };
        }
    }, [proxy, refresh]);
}

// ============================================
// 6. LogLines 组件 - 改进版本 (防抖 + 边距优化)
// ============================================

interface LogLinesProps {
    lines: string[];
    previewLines?: number;
}

function LogLines({ lines, previewLines = PREVIEW_LOG_LINES }: LogLinesProps) {
    const [showAll, setShowAll] = useState(false);
    // 倒序显示：最新日志在顶部
    const reversedLines = lines.slice().reverse();
    const displayLines = showAll ? reversedLines : reversedLines.slice(0, previewLines);

    return (
        <Stack hasGutter>
            <StackItem>
                <Card isCompact variant="secondary">
                    <CardBody style={{
                        padding: "var(--pf-t--global--spacer--lg, 24px)",
                    }}>
                        <pre style={{
                            background: "var(--pf-v6-c-code-block__code--BackgroundColor, #1f1f1f)",
                            color: "var(--pf-v6-c-code-block__code--Color, #fff)",
                            padding: "var(--pf-t--global--spacer--lg, 24px)",
                            borderRadius: "var(--pf-v6-c-code-block--BorderRadius, 4px)",
                            border: "1px solid var(--pf-v6-c-code-block--BorderColor, #333)",
                            overflowX: "auto",
                            maxHeight: "500px",
                            overflowY: "auto",
                            fontSize: "0.75rem",
                            lineHeight: "1.6",
                            fontFamily: "'Courier New', monospace",
                            margin: 0,
                            /* 防止闪烁：平滑过渡 */
                            transition: "all 0.15s ease-out",
                            /* WCAG AA 对比度 - 白色文本(#fff)在深色背景上 */
                            isolation: "isolate",
                            whiteSpace: "pre-wrap",
                            wordWrap: "break-word",
                        }}>
                            {displayLines.join("\n")}
                        </pre>
                    </CardBody>
                </Card>
            </StackItem>
            {!showAll && lines.length > previewLines && (
                <StackItem style={{ paddingLeft: "var(--pf-t--global--spacer--md, 16px)" }}>
                    <Button
                        variant="link"
                        onClick={() => setShowAll(true)}
                        style={{ padding: 0 }}
                    >
                        {_("Show all logs")} ({lines.length} {_("lines")})
                    </Button>
                </StackItem>
            )}
        </Stack>
    );
}

// ============================================
// 7. ConfigLinks 组件 - 简化版本
// ============================================

interface ConfigLinksProps {
    unit: string;
}

function ConfigLinks({ unit }: ConfigLinksProps) {
    const proxy = useMemo(() => serviceProxy(unit), [unit]) as unknown as {
        details?: { WorkingDirectory?: string };
    };

    const [workingDir, setWorkingDir] = useState<string | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const proc = cockpit.spawn(
                    ["systemctl", "show", "-p", "WorkingDirectory", unit],
                    { err: "out" }
                );
                const output = await proc;
                const match = output.match(/WorkingDirectory=(.+)/);
                if (match && match[1]) {
                    setWorkingDir(match[1]);
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                setConfigError(errorMsg);
            }
        })();
    }, [unit]);

    if (configError) {
        return <Alert variant="danger" isInline title={configError} />;
    }

    if (!workingDir) {
        return <Spinner size="md" aria-label={_("Loading config path")} />;
    }

    const configPath = `${workingDir}/config`;
    const encodedPath = encodeURIComponent(encodeURIComponent(configPath));
    const filesLink = `/files#/?path=${encodedPath}`;
    const workingDirLink = `/files#/?path=${encodeURIComponent(encodeURIComponent(workingDir))}`;

    return (
        <DescriptionList isCompact>
            <DescriptionListGroup>
                <DescriptionListTerm style={{
                    color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                    fontWeight: 600,
                    marginBottom: "0.5rem",
                }}>
                    {_("Working Directory")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                    <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }} justifyContent={{ default: "justifyContentSpaceBetween" }}>
                        <FlexItem>
                            <code style={{
                                fontFamily: "'Red Hat Mono', monospace",
                                fontSize: "0.75rem",
                                wordBreak: "break-all",
                            }}>
                                {workingDir}
                            </code>
                        </FlexItem>
                        <FlexItem>
                            <Button
                                variant="secondary"
                                size="sm"
                                isInline
                                component="a"
                                href={workingDirLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                icon={<ExternalLinkAltIcon />}
                                iconPosition="end"
                                style={{
                                    borderRadius: "var(--pf-v6-c-button--BorderRadius, 4px)"
                                }}
                            >
                                {_("Open")}
                            </Button>
                        </FlexItem>
                    </Flex>
                </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
                <DescriptionListTerm style={{
                    color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                    fontWeight: 600,
                    marginBottom: "0.5rem",
                }}>
                    {_("Configuration Path")}
                </DescriptionListTerm>
                <DescriptionListDescription>
                    <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }} justifyContent={{ default: "justifyContentSpaceBetween" }}>
                        <FlexItem>
                            <code style={{
                                fontFamily: "'Red Hat Mono', monospace",
                                fontSize: "0.75rem",
                                wordBreak: "break-all",
                            }}>
                                {configPath}
                            </code>
                        </FlexItem>
                        <FlexItem>
                            <Button
                                variant="secondary"
                                size="sm"
                                isInline
                                component="a"
                                href={filesLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                icon={<ExternalLinkAltIcon />}
                                iconPosition="end"
                                style={{
                                    borderRadius: "var(--pf-v6-c-button--BorderRadius, 4px)"
                                }}
                            >
                                {_("Open")}
                            </Button>
                        </FlexItem>
                    </Flex>
                </DescriptionListDescription>
            </DescriptionListGroup>
        </DescriptionList>
    );
}

// ============================================
// 8. Debug 组件 - 简化版本
// ============================================

interface DebugTabProps {
    unit: string;
}

function DebugTab({ unit }: DebugTabProps) {
    const proxy = useMemo(() => serviceProxy(unit), [unit]);
    useServiceUpdates(proxy);

    const debugInfo = {
        unit,
        exists: proxy.exists,
        state: proxy.state,
        enabled: proxy.enabled,
        details: (proxy as unknown as { details?: unknown }).details,
    };

    return (
        <Stack hasGutter>
            <StackItem>
                <Title headingLevel="h3" style={{ marginBottom: "var(--pf-t--global--spacer--md, 16px)" }}>
                    {_("Service State")}
                </Title>
            </StackItem>
            <StackItem>
                <pre style={{
                    background: "var(--pf-v6-c-code-block__code--BackgroundColor, #1f1f1f)",
                    color: "var(--pf-v6-c-code-block__code--Color, #fff)",
                    padding: "var(--pf-t--global--spacer--lg, 24px)",
                    borderRadius: "var(--pf-v6-c-code-block--BorderRadius, 4px)",
                    border: "1px solid var(--pf-v6-c-code-block--BorderColor, #333)",
                    overflowX: "auto",
                    maxHeight: "500px",
                    overflowY: "auto",
                    fontSize: "0.75rem",
                    lineHeight: "1.4",
                    fontFamily: "'Courier New', monospace",
                    margin: 0,
                    /* WCAG AA 对比度 */
                    isolation: "isolate",
                }}>
                    {JSON.stringify(debugInfo, null, 2)}
                </pre>
            </StackItem>
        </Stack>
    );
}

// ============================================
// 9. ServiceStatusRow 组件 - Kebab Menu + Description List 设计
// ============================================

// 格式化内存字节数
function formatMemory(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// 获取服务运行时信息 (Path, Memory, ActiveSince)
function useServiceDetails(unit: string) {
    const [path, setPath] = useState<string | null>(null);
    const [memory, setMemory] = useState<string | null>(null);
    const [activeSince, setActiveSince] = useState<string | null>(null);

    const fetchDetails = useCallback(async () => {
        if (!unit) return;
        try {
            const out = await cockpit.spawn(
                ["systemctl", "show", unit, "-p", "FragmentPath,MemoryCurrent,ActiveEnterTimestamp"],
                { err: "out" }
            );
            const lines: Record<string, string> = {};
            for (const line of out.split("\n")) {
                const eq = line.indexOf("=");
                if (eq > 0) lines[line.slice(0, eq)] = line.slice(eq + 1).trim();
            }
            if (lines["FragmentPath"]) setPath(lines["FragmentPath"]);
            const memBytes = parseInt(lines["MemoryCurrent"] || "0", 10);
            setMemory(isNaN(memBytes) || memBytes <= 0 ? null : formatMemory(memBytes));
            if (lines["ActiveEnterTimestamp"]) {
                const ts = lines["ActiveEnterTimestamp"];
                // ts looks like "Mon 2024-01-01 12:00:00 UTC"
                const d = new Date(ts.replace(/^\w+ /, ""));
                setActiveSince(isNaN(d.getTime()) ? ts : d.toLocaleString());
            }
        } catch (_e) { /* ignore */ }
    }, [unit]);

    useEffect(() => {
        fetchDetails();
        const id = setInterval(fetchDetails, 5000);
        return () => clearInterval(id);
    }, [fetchDetails]);

    return { path, memory, activeSince };
}

interface ServiceStatusRowProps {
    unit: string;
    title: string;
}

function ServiceStatusRow({ unit, title }: ServiceStatusRowProps) {
    const proxy = useMemo(() => serviceProxy(unit), [unit]);
    useServiceUpdates(proxy);

    const { allowed: hasPermission } = useSuperUserPermissions();
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [stopModalOpen, setStopModalOpen] = useState(false);

    const { path, memory, activeSince } = useServiceDetails(unit);

    const stateInfo = stateLabel(proxy.state);
    const isRunning = proxy.state === "running";
    const canActOnService = !busy && proxy.exists !== false && hasPermission;

    const run = async (fn: () => Promise<unknown>) => {
        setActionError(null);
        setBusy(true);
        try { await fn(); }
        catch (ex: unknown) { setActionError(ex instanceof Error ? ex.message : String(ex)); }
        finally { setBusy(false); }
    };

    const enableNow = () => run(async () => { await proxy.enable(); await proxy.start(); });
    const disableNow = () => run(async () => { await proxy.disable(); await proxy.stop(); });

    // Status row content
    const statusContent = !proxy.exists && proxy.exists !== false ? (
        <Spinner size="sm" aria-label={_("Loading")} />
    ) : proxy.exists === false ? (
        <span style={{ color: "var(--pf-t--global--color--status--warning--default, #f0ad4e)" }}>
            {_("Not found")}
        </span>
    ) : (
        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>
                <span style={{
                    color: stateInfo.status === "success"
                        ? "var(--pf-t--global--color--status--success--default, #3e8635)"
                        : stateInfo.status === "danger"
                            ? "var(--pf-t--global--color--status--danger--default, #c9190b)"
                            : stateInfo.status === "warning"
                                ? "var(--pf-t--global--color--status--warning--default, #f0ad4e)"
                                : "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontWeight: 500,
                }}>
                    {stateInfo.status === "success" && <CheckCircleIcon />}
                    {stateInfo.status === "danger" && <ExclamationCircleIcon />}
                    {stateInfo.status === "warning" && <ExclamationTriangleIcon />}
                    {stateInfo.text}
                </span>
            </FlexItem>
            {isRunning && activeSince && (
                <FlexItem>
                    <span style={{
                        color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                        fontSize: "0.875rem",
                    }}>
                        {_("Active since")} {activeSince}
                    </span>
                </FlexItem>
            )}
        </Flex>
    );

    return (
        <>
            <Card isCompact isFullHeight>
                <CardHeader
                    actions={{
                        actions: (
                            <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                                {/* Enable on boot toggle */}
                                <FlexItem>
                                    <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                                        <FlexItem>
                                            <label
                                                htmlFor={`${unit}-enable-switch`}
                                                style={{ marginBottom: 0, fontSize: "0.875rem", cursor: "pointer" }}
                                            >
                                                {_("Enable on boot")}
                                            </label>
                                        </FlexItem>
                                        <FlexItem>
                                            <Switch
                                                id={`${unit}-enable-switch`}
                                                isChecked={proxy.enabled === true}
                                                isDisabled={busy || proxy.exists === false || proxy.enabled === null || !hasPermission}
                                                onChange={(_event, checked) => checked ? enableNow() : disableNow()}
                                                aria-label={_("Enable on boot")}
                                            />
                                        </FlexItem>
                                    </Flex>
                                </FlexItem>
                                {/* Kebab menu */}
                                <FlexItem>
                                    <Dropdown
                                        isOpen={menuOpen}
                                        onOpenChange={(open) => setMenuOpen(open)}
                                        toggle={(toggleRef) => (
                                            <MenuToggle
                                                ref={toggleRef}
                                                variant="plain"
                                                isDisabled={!canActOnService}
                                                onClick={() => setMenuOpen(!menuOpen)}
                                                aria-label={_("Service actions")}
                                            >
                                                <EllipsisVIcon />
                                            </MenuToggle>
                                        )}
                                        popperProps={{ position: "right" }}
                                    >
                                        <DropdownList>
                                            <DropdownItem
                                                key="reload"
                                                isDisabled={!isRunning || !canActOnService}
                                                onClick={() => { setMenuOpen(false); run(() => (proxy as any).reload ? (proxy as any).reload() : proxy.restart()); }}
                                            >
                                                {_("Reload")}
                                            </DropdownItem>
                                            <DropdownItem
                                                key="restart"
                                                isDisabled={!canActOnService}
                                                onClick={() => { setMenuOpen(false); run(() => isRunning ? proxy.restart() : proxy.start()); }}
                                            >
                                                {isRunning ? _("Restart") : _("Start")}
                                            </DropdownItem>
                                            <DropdownItem
                                                key="stop"
                                                isDanger
                                                isDisabled={!isRunning || !canActOnService}
                                                onClick={() => { setMenuOpen(false); setStopModalOpen(true); }}
                                            >
                                                {_("Stop")}
                                            </DropdownItem>
                                        </DropdownList>
                                    </Dropdown>
                                </FlexItem>
                            </Flex>
                        ),
                        hasNoOffset: true,
                    }}
                >
                    <Title headingLevel="h3" size="xl">{title}</Title>
                </CardHeader>
                <CardBody>
                    {actionError && (
                        <Alert variant="danger" isInline title={actionError} style={{ marginBottom: "1rem" }} />
                    )}
                    <DescriptionList
                        isCompact
                        columnModifier={{ default: "1Col" }}
                        style={{ gap: "0.5rem" }}
                    >
                        <DescriptionListGroup>
                            <DescriptionListTerm style={{
                                color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                                fontWeight: 600,
                                minWidth: "6rem",
                            }}>
                                {_("Status")}
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                                {statusContent}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm style={{
                                color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                                fontWeight: 600,
                                minWidth: "6rem",
                            }}>
                                {_("Path")}
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                                {path ? (
                                    <span style={{
                                        fontFamily: "'Red Hat Mono', 'Courier New', monospace",
                                        fontSize: "0.875rem",
                                        wordBreak: "break-all",
                                    }}>
                                        {path}
                                    </span>
                                ) : (
                                    <Spinner size="sm" aria-label={_("Loading")} />
                                )}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm style={{
                                color: "var(--pf-t--global--text--color--subtle, #6a6e73)",
                                fontWeight: 600,
                                minWidth: "6rem",
                            }}>
                                {_("Memory")}
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                                {memory ? (
                                    <span style={{
                                        fontFamily: "'Red Hat Mono', 'Courier New', monospace",
                                        fontSize: "0.875rem",
                                    }}>
                                        {memory}
                                    </span>
                                ) : (
                                    <span style={{ color: "var(--pf-t--global--text--color--subtle, #6a6e73)", fontSize: "0.875rem" }}>—</span>
                                )}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                    </DescriptionList>
                </CardBody>
            </Card>

            {/* Stop confirmation modal */}
            <Modal
                isOpen={stopModalOpen}
                onClose={() => setStopModalOpen(false)}
                variant="small"
                aria-labelledby={`stop-modal-title-${unit}`}
            >
                <ModalHeader
                    title={_("Stop service?")}
                    titleIconVariant="warning"
                    labelId={`stop-modal-title-${unit}`}
                />
                <ModalBody>
                    <Content component="p">
                        {_("Are you sure you want to stop")} <strong>{title}</strong>?
                        {_(" This will immediately terminate the service.")}
                    </Content>
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="danger"
                        isLoading={busy}
                        onClick={() => { setStopModalOpen(false); run(() => proxy.stop()); }}
                    >
                        {_("Stop")}
                    </Button>
                    <Button variant="link" onClick={() => setStopModalOpen(false)}>
                        {_("Cancel")}
                    </Button>
                </ModalFooter>
            </Modal>
        </>
    );
}

// ============================================
// 10. LogsTab 组件 - 改进版本 (二级标签页结构)
// ============================================

function LogsTab() {
    const [activeServiceKey, setActiveServiceKey] = useState<ServiceKey>("admin");
    const [searchFilter, setSearchFilter] = useState("");
    const { allowed: hasPermission } = useSuperUserPermissions();

    const activeService = SERVICES.find(s => s.key === activeServiceKey);
    const unit = activeService?.unit || "";

    // 使用日志流 - 无需权限也可查看
    const { logs, error, isStreaming, reconnect, clearLogs } = useWebSocketLogStream(unit, true);

    // 过滤日志
    const filteredLogs = useMemo(() => {
        if (!searchFilter) return logs;
        const lower = searchFilter.toLowerCase();
        return logs.filter(log => log.toLowerCase().includes(lower));
    }, [logs, searchFilter]);

    return (
        <Stack hasGutter>
            {/* 二级标签页 - 服务切换 (Admin/User) */}
            <StackItem>
                <Tabs
                    activeKey={activeServiceKey}
                    onSelect={(_event, key) => setActiveServiceKey(key as ServiceKey)}
                    variant="secondary"
                >
                    {SERVICES.map(s => (
                        <Tab key={s.key} eventKey={s.key as ServiceKey} title={s.title} />
                    ))}
                </Tabs>
            </StackItem>

            {/* 工具栏 - Toolbar 组件包装搜索和控制 */}
            <StackItem>
                <Toolbar
                    colorVariant="secondary"
                    style={{
                        padding: "var(--pf-t--global--spacer--md, 16px) var(--pf-t--global--spacer--lg, 24px)",
                        borderRadius: "var(--pf-v6-c-card--BorderRadius, 4px)",
                    }}
                >
                    <ToolbarContent>
                        {/* 左侧：Clear Log + Reconnect */}
                        <ToolbarGroup variant="action-group">
                            <ToolbarItem>
                                <Button
                                    variant="secondary"
                                    onClick={clearLogs}
                                    style={{
                                        borderRadius: "var(--pf-v6-c-button--BorderRadius, 4px)"
                                    }}
                                >
                                    {_("Clear log")}
                                </Button>
                            </ToolbarItem>
                            <ToolbarItem>
                                <Button
                                    variant="secondary"
                                    onClick={reconnect}
                                    aria-label={_("Reconnect to log stream")}
                                    style={{
                                        borderRadius: "var(--pf-v6-c-button--BorderRadius, 4px)"
                                    }}
                                >
                                    {_("Reconnect")}
                                </Button>
                            </ToolbarItem>
                        </ToolbarGroup>

                        {/* 右侧：搜索 */}
                        <ToolbarGroup variant="filter-group" align={{ default: "alignEnd" }}>
                            <ToolbarItem>
                                <SearchInput
                                    placeholder={_("Search logs...")}
                                    value={searchFilter}
                                    onChange={(_event, value) => setSearchFilter(value)}
                                    onClear={() => setSearchFilter("")}
                                    resultsCount={
                                        searchFilter
                                            ? filteredLogs.length > 0
                                                ? `${filteredLogs.length} ${_("results")}`
                                                : _("No matches")
                                            : ""
                                    }
                                    style={{ width: "300px" }}
                                />
                            </ToolbarItem>
                        </ToolbarGroup>
                    </ToolbarContent>
                </Toolbar>
            </StackItem>

            {/* 日志内容 - 带内切感的容器 */}
            <StackItem style={{
                marginTop: "var(--pf-t--global--spacer--md, 16px)",
                paddingTop: "var(--pf-t--global--spacer--lg, 24px)",
                borderTop: "1px solid var(--pf-t--global--border--color--default, #d0d0d0)"
            }}>
                {error ? (
                    <Alert variant="danger" isInline title={error} />
                ) : !hasPermission && logs.length === 0 ? (
                    <Alert
                        variant="info"
                        isInline
                        title={_("Waiting for authentication...")}
                    />
                ) : filteredLogs.length === 0 ? (
                    <Alert
                        variant="info"
                        isInline
                        title={searchFilter ? _("No matching logs found") : _("No logs available")}
                    />
                ) : (
                    <LogLines lines={filteredLogs} previewLines={PREVIEW_LOG_LINES} />
                )}
            </StackItem>
        </Stack>
    );
}

// ============================================
// 11. Config Tab 组件 - 改进版本 (二级标签页结构)
// ============================================

function ConfigTab() {
    // Admin and User share the same working directory, so no sub-tabs needed
    const adminUnit = SERVICES.find(s => s.key === "admin")!.unit;

    return (
        <Stack hasGutter>
            {/* 配置链接 */}
            <StackItem>
                <ConfigLinks unit={adminUnit} />
            </StackItem>

            {/* Update 按钮区域 - 放在 Config 内防止误触 */}
            <StackItem>
                <div style={{
                    borderTop: "1px solid var(--pf-t--global--border--color--default, #d0d0d0)",
                    paddingTop: "var(--pf-t--global--spacer--lg, 24px)",
                    marginTop: "var(--pf-t--global--spacer--sm, 8px)",
                }}>
                    <Content component="p" style={{ marginBottom: "var(--pf-t--global--spacer--md, 16px)", color: "var(--pf-t--global--text--color--subtle, #6a6e73)", fontSize: "0.875rem" }}>
                        {_("Run the update script to pull the latest version of EzySpeech.")}
                    </Content>
                    <UpdateButton />
                </div>
            </StackItem>
        </Stack>
    );
}

// ============================================
// 12. Debug Tab 容器（支持服务切换） - 改进版本 (二级标签页结构)
// ============================================

function DebugTabContainer() {
    const [activeServiceKey, setActiveServiceKey] = useState<ServiceKey>("admin");
    const activeService = SERVICES.find(s => s.key === activeServiceKey);

    return (
        <Stack hasGutter>
            {/* 二级标签页 - 服务切换 (Admin/User) */}
            <StackItem>
                <Tabs
                    activeKey={activeServiceKey}
                    onSelect={(_event, key) => setActiveServiceKey(key as ServiceKey)}
                    variant="secondary"
                >
                    {SERVICES.map(s => (
                        <Tab key={s.key} eventKey={s.key as ServiceKey} title={s.title} />
                    ))}
                </Tabs>
            </StackItem>

            {/* Debug 信息 - 内切容器 */}
            <StackItem>
                {activeService && <DebugTab unit={activeService.unit} />}
            </StackItem>
        </Stack>
    );
}

// ============================================
// 13. Application 主组件 - PFv6风格 (Master-Detail 嵌套结构)
// ============================================

export const Application = () => {
    const [activeTab, setActiveTab] = useState<ServiceTabKey>("logs");

    return (
        <Page
            className="ct-page-fill"
            isContentFilled
            mainAriaLabel={_("EzySpeech services")}
        >
            <PageSection isWidthLimited isCenterAligned isFilled>
                <Stack hasGutter>
                    {/* 标题部分 */}
                    <StackItem>
                        <Content>
                            <Content component="h1">{_("EzySpeech services")}</Content>
                            <Content component="p">
                                {_("EzySpeech systemd service status and controls")}
                            </Content>
                        </Content>
                    </StackItem>

                    {/* 服务控制卡片 - 网格布局 */}
                    <StackItem>
                        <Grid hasGutter>
                            {SERVICES.map(s => (
                                <GridItem key={s.key} span={12} md={6}>
                                    <ServiceStatusRow unit={s.unit} title={s.title} />
                                </GridItem>
                            ))}
                        </Grid>
                    </StackItem>

                    {/* 标签页导航 + 内容卡片 */}
                    <StackItem>
                        <Card>
                            <CardBody style={{
                                padding: "0 var(--pf-t--global--spacer--lg, 24px) 0 var(--pf-t--global--spacer--lg, 24px)"
                            }}>
                                {/* 一级标签页导航 */}
                                <Tabs
                                    activeKey={activeTab}
                                    onSelect={(_event, key) => setActiveTab(key as ServiceTabKey)}
                                    variant="default"
                                >
                                    <Tab eventKey="logs" title={_("Logs")} />
                                    <Tab eventKey="config" title={_("Configuration")} />
                                    <Tab eventKey="debug" title={_("Debug")} />
                                </Tabs>
                            </CardBody>
                            <CardBody style={{
                                padding: "var(--pf-t--global--spacer--lg, 24px)",
                            }}>
                                {activeTab === "logs" && <LogsTab />}
                                {activeTab === "config" && <ConfigTab />}
                                {activeTab === "debug" && <DebugTabContainer />}
                            </CardBody>
                        </Card>
                    </StackItem>
                </Stack>
            </PageSection>
        </Page>
    );
};
