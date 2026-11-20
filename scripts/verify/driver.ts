import fs from 'node:fs';
import path from 'node:path';
import { openBrowser } from '@remotion/renderer';

type OpenedBrowser = Awaited<ReturnType<typeof openBrowser>>;
type RemotionPage = Awaited<ReturnType<OpenedBrowser['newPage']>>;

export interface ConsoleErrorRecord {
  message: string;
  url: string;
}

export interface NetworkErrorRecord {
  status: number;
  url: string;
  method?: string;
}

export class VerifyDriver {
  private readonly browser: OpenedBrowser;
  private readonly page: RemotionPage;
  private readonly baseUrl: string;
  private readonly consoleErrors: ConsoleErrorRecord[] = [];
  private readonly networkErrors: NetworkErrorRecord[] = [];
  private allowedErrorPatterns: RegExp[] = [];
  private closed = false;

  private constructor(browser: OpenedBrowser, page: RemotionPage, baseUrl: string) {
    this.browser = browser;
    this.page = page;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  static async launch(baseUrl: string): Promise<VerifyDriver> {
    const browser = await openBrowser('chrome', {
      browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || null,
      logLevel: 'error',
    });

    const driverRef: { current: VerifyDriver | null } = { current: null };

    const page = await browser.newPage({
      context: () => null,
      logLevel: 'error',
      indent: false,
      pageIndex: 0,
      onBrowserLog: (log) => {
        if (log.type === 'error' && driverRef.current) {
          const text = log.text || 'Unknown browser console error';
          if (!driverRef.current.isErrorAllowed(text)) {
            driverRef.current.consoleErrors.push({
              message: text,
              url: driverRef.current.currentUrlSafe(),
            });
          }
        }
      },
      onLog: () => {},
    });

    const driver = new VerifyDriver(browser, page, baseUrl);
    driverRef.current = driver;

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    const client = page._client();
    await client.send('Network.enable');
    await client.send('Runtime.enable');

    client.on('Runtime.exceptionThrown', (event: unknown) => {
      const ev = event as {
        exceptionDetails?: {
          text?: string;
          exception?: { description?: string };
        };
      };
      const message =
        ev.exceptionDetails?.exception?.description ||
        ev.exceptionDetails?.text ||
        'Uncaught browser exception';
      if (!driver.isErrorAllowed(message)) {
        driver.consoleErrors.push({
          message,
          url: driver.currentUrlSafe(),
        });
      }
    });

    client.on('Network.responseReceived', (event: unknown) => {
      const ev = event as {
        response?: { status?: number; url?: string };
      };
      const status = ev.response?.status ?? 0;
      const url = ev.response?.url ?? '';
      if (status >= 400 && url.startsWith(driver.baseUrl)) {
        if (!driver.isErrorAllowed(`${status} ${url}`)) {
          driver.networkErrors.push({ status, url });
        }
      }
    });

    return driver;
  }

  private currentUrlSafe(): string {
    try {
      return this.page.url();
    } catch {
      return '';
    }
  }

  private isErrorAllowed(text: string): boolean {
    return this.allowedErrorPatterns.some((pattern) => pattern.test(text));
  }

  allowErrorsTemporarily(patterns: RegExp[]): void {
    this.allowedErrorPatterns = patterns;
  }

  clearAllowedErrors(): void {
    this.allowedErrorPatterns = [];
  }

  getConsoleErrors(): ConsoleErrorRecord[] {
    return [...this.consoleErrors];
  }

  getNetworkErrors(): NetworkErrorRecord[] {
    return [...this.networkErrors];
  }

  url(): string {
    return this.page.url();
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.page.setViewport({ width, height, deviceScaleFactor: 1 });
    await this.sleep(150);
  }

  async goto(routePath: string): Promise<void> {
    const target = routePath.startsWith('http')
      ? routePath
      : `${this.baseUrl}${routePath.startsWith('/') ? '' : '/'}${routePath}`;
    await this.page.goto({ url: target, timeout: 30_000 });
    await this.waitForDomIdle();
  }

  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForDomIdle(ms = 350): Promise<void> {
    await this.sleep(ms);
  }

  async waitForText(text: string, timeoutMs = 15_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = await this.hasText(text);
      if (found) return;
      await this.sleep(150);
    }
    const snippet = (await this.getBodyText()).slice(0, 400);
    throw new Error(`Timed out waiting for text "${text}". Visible text starts with: ${snippet}`);
  }

  async waitForCondition(
    predicate: () => Promise<boolean>,
    description: string,
    timeoutMs = 15_000,
  ): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await predicate()) return;
      await this.sleep(150);
    }
    throw new Error(`Timed out waiting for condition: ${description}`);
  }

  async hasText(text: string): Promise<boolean> {
    return this.page.evaluate((needle: string) => {
      return (document.body?.innerText ?? '').includes(needle);
    }, text);
  }

  async getBodyText(): Promise<string> {
    return this.page.evaluate(() => document.body?.innerText ?? '');
  }

  async clickByText(
    text: string,
    opts?: { selector?: string; exact?: boolean; index?: number },
  ): Promise<void> {
    const selector = opts?.selector ?? 'button, a, [role="button"]';
    const exact = opts?.exact ?? false;
    const index = opts?.index ?? 0;

    const clicked = await this.page.evaluate(
      (sel: string, needle: string, isExact: boolean, targetIdx: number) => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const content = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          return isExact ? content === needle : content.includes(needle);
        });
        const target = nodes[targetIdx];
        if (!target) return false;
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        target.click();
        return true;
      },
      selector,
      text,
      exact,
      index,
    );

    if (!clicked) {
      throw new Error(`Could not find clickable element matching "${text}" (${selector})`);
    }
    await this.sleep(250);
  }

  async clickSelector(selector: string): Promise<void> {
    const clicked = await this.page.evaluate((sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.click();
      return true;
    }, selector);
    if (!clicked) {
      throw new Error(`Could not find element for selector "${selector}"`);
    }
    await this.sleep(250);
  }

  async fillByPlaceholder(placeholderSubstring: string, value: string): Promise<void> {
    const ok = await this.page.evaluate(
      (sub: string, nextVal: string) => {
        const inputs = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
        );
        const el = inputs.find((node) => (node.placeholder || '').includes(sub));
        if (!el) return false;

        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(el, nextVal);
        } else {
          el.value = nextVal;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      placeholderSubstring,
      value,
    );

    if (!ok) {
      throw new Error(`Could not find input/textarea with placeholder containing "${placeholderSubstring}"`);
    }
    await this.sleep(150);
  }

  async fillFirstTextareaIn(containerSelector: string, value: string): Promise<void> {
    const ok = await this.page.evaluate(
      (sel: string, nextVal: string) => {
        const container = document.querySelector(sel);
        const el = container?.querySelector<HTMLTextAreaElement>('textarea');
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(el, nextVal);
        } else {
          el.value = nextVal;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      containerSelector,
      value,
    );

    if (!ok) {
      throw new Error(`Could not find textarea inside "${containerSelector}"`);
    }
    await this.sleep(150);
  }

  async evaluate<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.page.evaluate(fn) as Promise<T>;
  }

  async evaluateWithArg<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T> {
    return this.page.evaluate(fn as (a: unknown) => T | Promise<T>, arg as never) as Promise<T>;
  }

  async screenshot(filePath: string, opts?: { fullPage?: boolean }): Promise<void> {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const fullPage = opts?.fullPage ?? true;
    const client = this.page._client();

    if (fullPage) {
      // App.tsx locks the shell to `h-dvh overflow-hidden` and scrolls `<main>`.
      // Temporarily relax overflow locks so CDP captureBeyondViewport captures full content.
      await this.page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>('#root > div');
        const main = document.querySelector<HTMLElement>('main');
        if (shell) {
          shell.dataset.prevHeight = shell.style.height;
          shell.dataset.prevOverflow = shell.style.overflow;
          shell.style.height = 'auto';
          shell.style.overflow = 'visible';
        }
        if (main) {
          main.dataset.prevOverflow = main.style.overflow;
          main.dataset.prevHeight = main.style.height;
          main.style.overflow = 'visible';
          main.style.height = 'auto';
        }
      });
      await this.sleep(120);
    }

    try {
      const res = (await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: fullPage,
        fromSurface: true,
      })) as { value?: { data?: string } };

      const base64 = res?.value?.data;
      if (!base64) {
        throw new Error(`Page.captureScreenshot returned empty data for ${filePath}`);
      }
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    } finally {
      if (fullPage) {
        await this.page.evaluate(() => {
          const shell = document.querySelector<HTMLElement>('#root > div');
          const main = document.querySelector<HTMLElement>('main');
          if (shell) {
            shell.style.height = shell.dataset.prevHeight ?? '';
            shell.style.overflow = shell.dataset.prevOverflow ?? '';
            delete shell.dataset.prevHeight;
            delete shell.dataset.prevOverflow;
          }
          if (main) {
            main.style.overflow = main.dataset.prevOverflow ?? '';
            main.style.height = main.dataset.prevHeight ?? '';
            delete main.dataset.prevOverflow;
            delete main.dataset.prevHeight;
          }
        });
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.browser.close({ silent: true });
    } catch {
      // Ignore shutdown errors
    }
  }
}
