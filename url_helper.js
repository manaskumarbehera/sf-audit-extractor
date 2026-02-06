// Shared URL helpers for Salesforce domains
export function originFromUrl(url) {
    try {
        return new URL(url).origin;
    } catch {
        const m = String(url || '').match(/^(https:\/\/[^/]+)/i);
        return m ? m[1] : null;
    }
}

export function sanitizeUrl(url) {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

export function normalizeApiBase(url) {
    const o = sanitizeUrl(url);
    if (!o) return null;

    const u = new URL(o);
    const setHost = (host) => { u.hostname = host; };

    const appendMy = (prefix) => setHost(`${prefix}.my.salesforce.com`);

    let h = u.hostname.toLowerCase();

    if (h.endsWith('.my.salesforce.com') || (h.endsWith('.salesforce.com') && !h.endsWith('.force.com'))) {
        // already API-ready; keep as-is
    }
    // orgname.lightning.force.com -> orgname.my.salesforce.com
    else if (h.endsWith('.lightning.force.com')) {
        appendMy(h.replace(/\.lightning\.force\.com$/, ''));
    }
    // orgname--sandboxname.sandbox.lightning.force.com -> orgname--sandboxname.sandbox.my.salesforce.com
    else if (h.includes('.sandbox.') && h.endsWith('.force.com')) {
        setHost(h.replace(/\.force\.com$/, '.salesforce.com'));
    }
    // orgname.develop.lightning.force.com -> orgname.develop.my.salesforce.com
    else if (h.includes('.develop.') && h.endsWith('.force.com')) {
        setHost(h.replace(/\.force\.com$/, '.salesforce.com'));
    }
    // orgname.scratch.lightning.force.com -> orgname.scratch.my.salesforce.com
    else if (h.includes('.scratch.') && h.endsWith('.force.com')) {
        setHost(h.replace(/\.force\.com$/, '.salesforce.com'));
    }
    // orgname.visual.force.com -> orgname.my.salesforce.com
    else if (h.endsWith('.visual.force.com')) {
        appendMy(h.replace(/\.visual\.force\.com$/, ''));
    }
    // orgname.vf.force.com -> orgname.my.salesforce.com
    else if (h.endsWith('.vf.force.com')) {
        appendMy(h.replace(/\.vf\.force\.com$/, ''));
    }
    // orgname.salesforce-setup.com or orgname.my.salesforce-setup.com -> orgname.my.salesforce.com
    else if (h.endsWith('.salesforce-setup.com')) {
        let prefix = h.replace(/\.salesforce-setup\.com$/, '');
        prefix = prefix.replace(/\.my$/, ''); // drop trailing .my to prevent double .my
        appendMy(prefix);
    }
    // any other .force.com -> .salesforce.com
    else if (h.endsWith('.force.com')) {
        setHost(h.replace(/\.force\.com$/, '.salesforce.com'));
    }

    // Final safety: collapse accidental duplicate ".my.my"
    const deduped = u.hostname.replace(/\.my\.my\.salesforce\.com$/i, '.my.salesforce.com');
    if (deduped !== u.hostname) setHost(deduped);

    return u.origin;
}

