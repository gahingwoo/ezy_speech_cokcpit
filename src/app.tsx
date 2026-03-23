/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Copyright (C) 2017 Red Hat, Inc.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Stack, StackItem } from "@patternfly/react-core/dist/esm/layouts/Stack/index.js";
import { proxy as serviceProxy } from "service.js";
import cockpit from "cockpit";

const _ = cockpit.gettext;

const SERVICES: { unit: string; title: string }[] = [
    { unit: "ezyspeech-admin.service", title: _("EzySpeech Admin") },
    { unit: "ezyspeech-user.service", title: _("EzySpeech User") },
];

type CockpitServiceProxy = ReturnType<typeof serviceProxy>;

function stateLabel(state: CockpitServiceProxy["state"]): { text: string; color: "green" | "red" | "orange" | "grey" | "blue" } {
    switch (state) {
    case "running":
        return { text: _("Running"), color: "green" };
    case "stopped":
        return { text: _("Stopped"), color: "grey" };
    case "failed":
        return { text: _("Failed"), color: "red" };
    case "starting":
        return { text: _("Starting"), color: "orange" };
    case "stopping":
        return { text: _("Stopping"), color: "orange" };
    default:
        return { text: _("Unknown"), color: "grey" };
    }
}

function ServiceCard({ unit, title }: { unit: string; title: string }) {
    const proxy = useMemo(() => serviceProxy(unit), [unit]);
    const [, bump] = useState(0);
    const refresh = useCallback(() => bump(n => n + 1), []);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        proxy.addEventListener("changed", refresh);
        return () => proxy.removeEventListener("changed", refresh);
    }, [proxy, refresh]);

    const { text: stateText, color: stateColor } = stateLabel(proxy.state);
    const ready = proxy.exists !== null;
    const startDisabled = busy || proxy.exists === false ||
        proxy.state === "running" || proxy.state === "starting" || proxy.state === "stopping";
    const stopDisabled = busy || proxy.exists === false ||
        (proxy.state !== "running" && proxy.state !== "starting");

    const run = async (fn: () => Promise<unknown>) => {
        setActionError(null);
        setBusy(true);
        try {
            await fn();
        } catch (ex: unknown) {
            setActionError(cockpit.message(ex));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card isCompact>
            <CardTitle>{title}</CardTitle>
            <CardBody>
                <Stack hasGutter>
                    <StackItem>
                        <Content component="p">
                            <strong>{unit}</strong>
                        </Content>
                    </StackItem>
                    <StackItem>
                        { !ready
                            ? <Spinner size="md" aria-label={_("Loading state")} />
                            : proxy.exists === false
                                ? (
                                    <Alert
                                        variant="warning"
                                        isInline
                                        title={_("Unit not found on this system")}
                                    />
                                )
                                : (
                                    <Label color={stateColor}>
                                        {`${stateText}${
                                            proxy.enabled === true
                                                ? ` · ${_("enabled")}`
                                                : proxy.enabled === false
                                                    ? ` · ${_("disabled")}`
                                                    : ""
                                        }`}
                                    </Label>
                                )}
                    </StackItem>
                    {actionError !== null && (
                        <StackItem>
                            <Alert variant="danger" isInline title={actionError} />
                        </StackItem>
                    )}
                    <StackItem>
                        <Stack hasGutter>
                            <StackItem>
                                <Button
                                    variant="primary"
                                    isDisabled={startDisabled}
                                    onClick={() => run(() => proxy.start())}
                                >
                                    {_("Start")}
                                </Button>
                                { " " }
                                <Button
                                    variant="danger"
                                    isDisabled={stopDisabled}
                                    onClick={() => run(() => proxy.stop())}
                                >
                                    {_("Stop")}
                                </Button>
                                { " " }
                                <Button
                                    variant="secondary"
                                    isDisabled={busy || proxy.exists === false}
                                    onClick={() => run(() => proxy.restart())}
                                >
                                    {_("Restart")}
                                </Button>
                            </StackItem>
                            <StackItem>
                                <Button
                                    variant="link"
                                    isDisabled={busy || proxy.exists === false || proxy.enabled === true}
                                    onClick={() => run(() => proxy.enable())}
                                >
                                    {_("Enable on boot")}
                                </Button>
                                { " " }
                                <Button
                                    variant="link"
                                    isDisabled={busy || proxy.exists === false || proxy.enabled === false}
                                    onClick={() => run(() => proxy.disable())}
                                >
                                    {_("Disable")}
                                </Button>
                            </StackItem>
                        </Stack>
                    </StackItem>
                </Stack>
            </CardBody>
        </Card>
    );
}

export const Application = () => {
    return (
        <Page
            className="ct-page-fill"
            isContentFilled
            mainAriaLabel={_("EzySpeech services")}
        >
            <PageSection isWidthLimited isCenterAligned isFilled>
                <Stack hasGutter>
                    <StackItem>
                        <Content>
                            <h1>{_("EzySpeech services")}</h1>
                            <p>{_("Start, stop, or restart the EzySpeech systemd units on this machine.")}</p>
                        </Content>
                    </StackItem>
                    <StackItem>
                        <Grid hasGutter>
                            {SERVICES.map(s => (
                                <GridItem key={s.unit} span={12} md={6}>
                                    <ServiceCard unit={s.unit} title={s.title} />
                                </GridItem>
                            ))}
                        </Grid>
                    </StackItem>
                </Stack>
            </PageSection>
        </Page>
    );
};
