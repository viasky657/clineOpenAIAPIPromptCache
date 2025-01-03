
import { VSCodeButton, VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useExtensionState } from "../../context/ExtensionStateContext";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Define metrics interface for display purposes
interface ApiMetrics {
  totalTokensIn?: number;
  totalTokensOut?: number;
  totalCacheWrites?: number;
  totalCacheReads?: number;
  totalCost?: number;
}

const ApiStatusDisplayComponent: React.FC<{ metrics: ApiMetrics | undefined }> = ({ metrics }) => {
  return (
    <>
      <div>Tokens In: {metrics?.totalTokensIn || 0}</div>
      <div>Tokens Out: {metrics?.totalTokensOut || 0}</div>
      <div>Cache Writes: {metrics?.totalCacheWrites || 0}</div>
      <div>Cache Reads: {metrics?.totalCacheReads || 0}</div>
      <div>Total Cost: ${metrics?.totalCost?.toFixed(4) || '0.0000'}</div>
    </>
  );
};

const ApiStatusDisplay: React.FC<{ metrics: ApiMetrics | undefined }> = ({ metrics }) => {
  const { apiConfiguration, openRouterModels } = useExtensionState();
  const modelCapabilities = useMemo(() => {
    if (!apiConfiguration?.apiProvider) return null;
    const modelId = apiConfiguration.openRouterModelId;
    const modelInfo = modelId ? openRouterModels[modelId] : null;
    return {
      supportsComputerUse: modelInfo?.supportsComputerUse ?? false,
      supportsPromptCache: modelInfo?.supportsPromptCache ?? false
    };
  }, [apiConfiguration, openRouterModels]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '16px',
      backgroundColor: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      borderRadius: '4px'
    }}>
      <div>Provider: {apiConfiguration?.apiProvider || 'Not Connected'}</div>
      {modelCapabilities && (
        <>
          <div>Computer Usage: {modelCapabilities.supportsComputerUse ? 'Enabled' : 'Disabled'}</div>
          <div>Prompt Cache: {modelCapabilities.supportsPromptCache ? 'Enabled' : 'Disabled'}</div>
        </>
      )}
      {apiConfiguration?.apiProvider && metrics && <ApiStatusDisplayComponent metrics={metrics} />}
    </div>
  );
};

interface ProviderStatus {
  name: string;
  enabled: boolean;
  isLocal: boolean;
  isRunning: boolean | null;
  error?: string;
  lastChecked: Date;
  responseTime?: number;
  url: string | null;
}

interface PullRequestForm {
  description: string;
  typeOfChange: {
    bugFix: boolean;
    newFeature: boolean;
    breakingChange: boolean;
    documentation: boolean;
  };
  preFlightChecklist: {
    singleFeature: boolean;
    testsPassing: boolean;
    reviewedGuidelines: boolean;
    PromptCacheIssue: boolean;
    extensionwebviewUIIssue: boolean;
    computerusageIssue: boolean;
  };
  screenshots: string;
  additionalNotes: string;
  commitName: string;
}

interface SystemInfo {
  os: string;
  browser: string;
  screen: string;
  language: string;
  timezone: string;
  memory: string;
  cores: number;
  deviceType: string;
  colorDepth: string;
  pixelRatio: number;
  online: boolean;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
}

function generateTicketNumber(): string {
  return `CLINE-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

interface DebugViewProps {
  onDone: () => void;
}

declare global {
  interface Window {
    acquireVsCodeApi: () => any;
  }
}

//const vscode = window.acquireVsCodeApi(); This currently does nothing but I left it in in case someone would like to import and use vscode api instead of react. 

// Error boundary for catching JavaScript errors
class DebugViewErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[DebugView] Error caught by boundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          color: 'var(--vscode-errorForeground)',
          backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
          border: '1px solid var(--vscode-inputValidation-errorBorder)',
          borderRadius: '4px'
        }}>
          <h3>JavaScript Error</h3>
          <p>The debug view encountered an error. Please try refreshing the view.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

const DebugView: React.FC<DebugViewProps> = ({ onDone }) => {
  const { version, apiConfiguration, clineMessages } = useExtensionState();
  const [activeProviders, setActiveProviders] = useState<ProviderStatus[]>([]);
  const LOCAL_PROVIDERS = useMemo(() => ['Ollama', 'LMStudio', 'OpenAILike'], []);
  const [updateMessage, setUpdateMessage] = useState<string>('');
  const [systemInfo] = useState<SystemInfo>(getSystemInfo());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isLatestBranch] = useState(false);

  const metrics = useMemo(() => {
    if (!clineMessages.length) return undefined;
    const lastApiReqIndex = clineMessages.findIndex(m => m.say === "api_req_started");
    if (lastApiReqIndex === -1) return undefined;
    const lastApiReq = clineMessages[lastApiReqIndex];
    if (!lastApiReq.text) return undefined;
    try {
      const info = JSON.parse(lastApiReq.text);
      return {
        totalTokensIn: info.tokensIn,
        totalTokensOut: info.tokensOut,
        totalCacheWrites: info.cacheWrites,
        totalCacheReads: info.cacheReads,
        totalCost: info.cost
      };
    } catch {
      return undefined;
    }
  }, [clineMessages]);

  // Pull Request Form State
  const [prForm, setPrForm] = useState<PullRequestForm>({
    description: '',
    typeOfChange: {
      bugFix: false,
      newFeature: false,
      breakingChange: false,
      documentation: false,
    },
    preFlightChecklist: {
      singleFeature: false,
      testsPassing: false,
      reviewedGuidelines: false,
      PromptCacheIssue: false,
      extensionwebviewUIIssue: false,
      computerusageIssue: false,
    },
    screenshots: '',
    additionalNotes: '',
    commitName: '',
  });

  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'openDebugView') {
        console.log('[DebugView] Received openDebugView message');
        // No need to set state here as the parent likely controls visibility
      }
    };

    window.addEventListener('message', messageHandler);
    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  const handlePrFormChange = useCallback((field: keyof PullRequestForm, value: string) => {
    setPrForm(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleTypeOfChangeToggle = useCallback((field: keyof typeof prForm.typeOfChange) => {
    setPrForm(prev => ({
      ...prev,
      typeOfChange: {
        ...prev.typeOfChange,
        [field]: !prev.typeOfChange[field]
      }
    }));
  }, [prForm]);

  const handlePreFlightToggle = useCallback((field: keyof typeof prForm.preFlightChecklist) => {
    setPrForm(prev => ({
      ...prev,
      preFlightChecklist: {
        ...prev.preFlightChecklist,
        [field]: !prev.preFlightChecklist[field]
      }
    }));
  }, [prForm]);

  // Helper Functions
  function getSystemInfo(): SystemInfo {
    try {
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      const getBrowserInfo = (): string => {
        try {
          const ua = navigator.userAgent;
          let browser = 'Unknown';
          if (ua.includes('Firefox/')) browser = 'Firefox';
          else if (ua.includes('Chrome/')) {
            if (ua.includes('Edg/')) browser = 'Edge';
            else if (ua.includes('OPR/')) browser = 'Opera';
            else browser = 'Chrome';
          } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
            browser = 'Safari';
          }
          const match = ua.match(new RegExp(`${browser}\\/([\\d.]+)`));
          const version = match ? ` ${match[1]}` : '';
          return `${browser}${version}`;
        } catch (error) {
          console.error('Error getting browser info:', error);
          return 'Unknown';
        }
      };

      const getOperatingSystem = (): string => {
        try {
          const ua = navigator.userAgent;
          if (ua.includes('Win')) return 'Windows';
          if (ua.includes('Mac')) {
            if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
            return 'macOS';
          }
          if (ua.includes('Linux')) return 'Linux';
          if (ua.includes('Android')) return 'Android';
          return navigator.platform || 'Unknown';
        } catch (error) {
          console.error('Error getting OS info:', error);
          return 'Unknown';
        }
      };

      const getDeviceType = (): string => {
        try {
          const ua = navigator.userAgent;
          if (ua.includes('Mobile')) return 'Mobile';
          if (ua.includes('Tablet')) return 'Tablet';
          return 'Desktop';
        } catch (error) {
          console.error('Error getting device type:', error);
          return 'Unknown';
        }
      };

      const getMemoryInfo = (): string => {
        try {
          if ('memory' in performance) {
            const memory = (performance as any).memory;
            return `${formatBytes(memory.jsHeapSizeLimit)} (Used: ${formatBytes(memory.usedJSHeapSize)})`;
          }
          return 'Not available';
        } catch (error) {
          console.error('Error getting memory info:', error);
          return 'Not available';
        }
      };

      return {
        os: getOperatingSystem(),
        browser: getBrowserInfo(),
        screen: window.screen ? `${window.screen.width}x${window.screen.height}` : 'Unknown',
        language: navigator.language || 'Unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
        memory: getMemoryInfo(),
        cores: navigator.hardwareConcurrency || 0,
        deviceType: getDeviceType(),
        colorDepth: window.screen ? `${window.screen.colorDepth}-bit` : 'Unknown',
        pixelRatio: window.devicePixelRatio || 1,
        online: navigator.onLine || false,
        cookiesEnabled: navigator.cookieEnabled || false,
        doNotTrack: navigator.doNotTrack === '1',
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      // Return default values if there's an error
      return {
        os: 'Unknown',
        browser: 'Unknown',
        screen: 'Unknown',
        language: 'Unknown',
        timezone: 'Unknown',
        memory: 'Not available',
        cores: 0,
        deviceType: 'Unknown',
        colorDepth: 'Unknown',
        pixelRatio: 1,
        online: false,
        cookiesEnabled: false,
        doNotTrack: false,
      };
    }
  }

  const checkProviderStatus = useCallback(async (url: string | null, providerName: string): Promise<ProviderStatus> => {
    if (!url) {
      console.log(`[Debug] No URL provided for ${providerName}`);
      return {
        name: providerName,
        enabled: false,
        isLocal: true,
        isRunning: false,
        error: 'No URL configured',
        lastChecked: new Date(),
        url: null,
      };
    }

    const startTime = performance.now();

    try {
      if (providerName.toLowerCase() === 'ollama') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'text/plain,application/json' },
          });
          clearTimeout(timeoutId);

          const text = await response.text();
          if (text.includes('Ollama is running')) {
            return {
              name: providerName,
              enabled: false,
              isLocal: true,
              isRunning: true,
              lastChecked: new Date(),
              responseTime: performance.now() - startTime,
              url,
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('aborted')) {
            return {
              name: providerName,
              enabled: false,
              isLocal: true,
              isRunning: false,
              error: 'Connection timeout',
              lastChecked: new Date(),
              responseTime: performance.now() - startTime,
              url,
            };
          }
        }
      }

      const checkUrls = [`${url}/api/health`, url.endsWith('v1') ? `${url}/models` : `${url}/v1/models`];
      const results = await Promise.all(
        checkUrls.map(async (checkUrl) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(checkUrl, {
              signal: controller.signal,
              headers: { Accept: 'application/json' },
            });
            clearTimeout(timeoutId);

            return response.ok;
          } catch (error) {
            return false;
          }
        }),
      );

      const isRunning = results.some((result) => result);

      return {
        name: providerName,
        enabled: false,
        isLocal: true,
        isRunning,
        lastChecked: new Date(),
        responseTime: performance.now() - startTime,
        url,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: providerName,
        enabled: false,
        isLocal: true,
        isRunning: false,
        error: errorMessage,
        lastChecked: new Date(),
        responseTime: performance.now() - startTime,
        url,
      };
    }
  }, []);

  const updateProviderStatuses = useCallback(async () => {
    try {
      const providers = LOCAL_PROVIDERS.map(name => ({
        name,
        settings: {
          enabled: true,
          baseUrl: process.env[`REACT_APP_${name.toUpperCase()}_URL`] || null
        }
      }));

      const statuses = await Promise.all(
        providers.map(async (provider) => {
          const url = provider.settings.baseUrl;
          const status = await checkProviderStatus(url, provider.name);
          return {
            ...status,
            enabled: provider.settings.enabled ?? false,
          };
        }),
      );
      setActiveProviders(statuses);
    } catch (error) {
      console.error('[Debug] Failed to update provider statuses:', error);
    }
  }, [checkProviderStatus, LOCAL_PROVIDERS]);

  useEffect(() => {
    updateProviderStatuses();
    const interval = setInterval(updateProviderStatuses, 30000);
    return () => clearInterval(interval);
  }, [updateProviderStatuses]);

  const handleCheckForUpdate = useCallback(async () => {
    if (isCheckingUpdate) return;

    try {
      setIsCheckingUpdate(true);
      setUpdateMessage('Checking for updates...');

      const branchToCheck = isLatestBranch ? 'main' : 'stable';
      const commitJsonUrl = `https://raw.githubusercontent.com/cline/cline/${branchToCheck}/package.json`;
      const localCommitResponse = await fetch(commitJsonUrl);

      if (!localCommitResponse.ok) {
        throw new Error('Failed to fetch version info');
      }

      const packageJson = await localCommitResponse.json();
      const latestVersion = packageJson.version;

      if (latestVersion !== version) {
        setUpdateMessage(
          `Update available from ${branchToCheck} branch!\n` +
          `Current: v${version}\n` +
          `Latest: v${latestVersion}`,
        );
      } else {
        setUpdateMessage(`You are on the latest version (v${version}) from the ${branchToCheck} branch`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check for updates';
      setUpdateMessage(errorMessage);
      console.error('[Debug] Update check failed:', error);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isCheckingUpdate, isLatestBranch, version]);

  const handleCopyToClipboard = useCallback(() => {
    const commitName = prForm.commitName || generateTicketNumber();
    const debugInfo = {
      System: systemInfo,
      Providers: {
        Local: activeProviders.map((provider) => ({
          name: provider.name,
          enabled: provider.enabled,
          isLocal: provider.isLocal,
          running: provider.isRunning,
          error: provider.error,
          lastChecked: provider.lastChecked,
          responseTime: provider.responseTime,
          url: provider.url,
        })),
        Cloud: apiConfiguration ? {
          activeProvider: apiConfiguration.apiProvider,
          baseUrl: apiConfiguration.apiProvider === "anthropic" ? apiConfiguration.anthropicBaseUrl :
                  apiConfiguration.apiProvider === "openai" ? apiConfiguration.openAiBaseUrl :
                  undefined,
          modelId: apiConfiguration.openRouterModelId || apiConfiguration.openAiModelId,
          error: apiConfiguration.error,
          hasKey: !!(apiConfiguration.apiKey || apiConfiguration.openRouterApiKey || apiConfiguration.openAiApiKey)
        } : null,
        metrics: metrics // Use the metrics from the ApiStatusDisplay component
      },
      PullRequestForm: prForm, // Include the Pull Request Form data
      Version: {
        clineVersion: "3.0",
        displayVersion: `v${version}`,
        branch: isLatestBranch ? 'main' : 'stable',
        commit: {
          name: commitName,
          timestamp: new Date().toISOString()
        }
      },
      Timestamp: new Date().toISOString(),
    };

    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
      .then(() => {
        toast.success('Debug information (including Pull Request Form) copied to clipboard!');
      })
      .catch(error => {
        toast.error(`Failed to copy: ${(error as Error).message}`);
      });
  }, [activeProviders, systemInfo, isLatestBranch, version, apiConfiguration, prForm, metrics]);

  return (
    <React.Fragment>
      <ToastContainer position="top-right" theme="dark" />
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--vscode-editor-background)",
        color: "var(--vscode-editor-foreground)",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--vscode-panel-border)",
        }}>
          <h3 style={{ margin: 0, fontSize: "14px" }}>Debug</h3>
          <VSCodeButton onClick={onDone}>Done</VSCodeButton>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
          {/* Bug Report Pre-Checklist */}
          <div style={{ marginBottom: "24px" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "13px" }}>Bug Report Pre-Checklist</h4>
            <div style={{
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              padding: "12px",
              borderRadius: "4px",
              marginBottom: "8px"
            }}>
              <p style={{
                margin: "0 0 8px 0",
                fontSize: "12px",
                fontStyle: "italic"
              }}>
                All boxes must be unchecked to proceed with creating a new issue. These are common scenarios that do not need to be reported.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <VSCodeCheckbox>
                  Some LLMs struggle with multiple function calls and complex prompting that Cline requires to work. Did this error have to deal with troubleshooting the Cline Prompting?
                </VSCodeCheckbox>
                <VSCodeCheckbox>
                  Does the error relate to computer usage not being turned on for other models? Cline gives complex prompts to other LLMs, that are not Anthropic models, which give them instructions and the ability to use the computer.
                </VSCodeCheckbox>
                <VSCodeCheckbox>
                  Did your issue have to deal with adding a prompt cache for other API providers? Many API Providers have automated cache enabled and optimized on their end so please be sure to check how the provider utilize prompt cache in their API Documentation before submitting an issue regarding prompt cache.
                </VSCodeCheckbox>
              </div>
            </div>
          </div>

          {/* Pull Request Form Section */}
          <div style={{ marginBottom: "24px" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "13px" }}>Pull Request Form</h4>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Description</h5>
              <VSCodeTextArea
                value={prForm.description}
                onChange={(e) => handlePrFormChange('description', (e.target as HTMLTextAreaElement).value)}
                placeholder="Describe your changes in detail. What problem does this PR solve?"
                style={{ width: "100%", minHeight: "80px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Type of Change</h5>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <VSCodeCheckbox
                  checked={prForm.typeOfChange.bugFix}
                  onChange={() => handleTypeOfChangeToggle('bugFix')}
                >
                  🐛 Bug fix (non-breaking change which fixes an issue)
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.typeOfChange.newFeature}
                  onChange={() => handleTypeOfChangeToggle('newFeature')}
                >
                  ✨ New feature (non-breaking change which adds functionality)
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.typeOfChange.breakingChange}
                  onChange={() => handleTypeOfChangeToggle('breakingChange')}
                >
                  💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.typeOfChange.documentation}
                  onChange={() => handleTypeOfChangeToggle('documentation')}
                >
                  📚 Documentation update
                </VSCodeCheckbox>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Pre-flight Checklist</h5>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.singleFeature}
                  onChange={() => handlePreFlightToggle('singleFeature')}
                >
                  Changes are limited to a single feature, bugfix or chore (split larger changes into separate PRs)
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.PromptCacheIssue}
                  onChange={() => handlePreFlightToggle('PromptCacheIssue')}
                >
                  The prompt cache is handled by different API Providers sometimes on their end automatically, so even if an API provider does not say in this extension that it supports prompt cache. Please be sure to check the API provider's API documentation to be sure that the prompt cache is supported on their end before filing an issue. Please check this if you have done so.
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.extensionwebviewUIIssue}
                  onChange={() => handlePreFlightToggle('extensionwebviewUIIssue')}
                >
                  The webview folder cannot natively retrieve API provider information and other information directly from the source and core of this program extension due to the way typescript works. If your webview component is having trouble with retrieving information from the backend, please be sure to check if it is calling this data through the extension file and not directly through the source file before filing an issue. Please check this box if you have checked this potential solution to the error before submitting your issue.
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.computerusageIssue}
                  onChange={() => handlePreFlightToggle('computerusageIssue')}
                >
                  Computer usage is a tool call for a LLM to use the computer terminal and other features. Claude is designed to handle multiple tool calls but other LLMs do not natively support this. The other LLMs instead are given a prompt from the prompt.ts file in the program (along with some other prompts for diff handling) to tell them how to use the tools. This may cause errors from the LLMs since they are not trained to handle complex prompts. Please be sure to check that any failure from the LLM to use a tool is not from an LLM that is not designed to handle multiple tool calls before submitting an issue. Please check this if you have already checked the model documentation before submitting an issue.
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.testsPassing}
                  onChange={() => handlePreFlightToggle('testsPassing')}
                >
                  Tests are passing (`npm test`) and code is formatted and linted (`npm run format && npm run lint`)
                </VSCodeCheckbox>
                <VSCodeCheckbox
                  checked={prForm.preFlightChecklist.reviewedGuidelines}
                  onChange={() => handlePreFlightToggle('reviewedGuidelines')}
                >
                  I have reviewed contributor guidelines
                </VSCodeCheckbox>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Screenshots</h5>
              <VSCodeTextArea
                value={prForm.screenshots}
                onChange={(e) => handlePrFormChange('screenshots', (e.target as HTMLTextAreaElement).value)}
                placeholder="For UI changes, add screenshots here"
                style={{ width: "100%", minHeight: "80px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>API Status</h5>

              {/* Local API Providers */}
              <div style={{ marginBottom: "12px" }}>
                <h6 style={{ margin: "0 0 4px 8px", fontSize: "11px", opacity: 0.8 }}>Local Providers</h6>
                <div style={{
                  backgroundColor: "var(--vscode-textBlockQuote-background)",
                  padding: "8px",
                  borderRadius: "4px"
                }}>
                  {activeProviders.map((provider) => (
                    <div key={provider.name} style={{ marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <div style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: provider.isRunning ?
                            "var(--vscode-testing-iconPassed)" :
                            "var(--vscode-testing-iconFailed)"
                        }} />
                        <span style={{ fontSize: "12px" }}>{provider.name}</span>
                      </div>
                      {provider.error && (
                        <div style={{
                          fontSize: "11px",
                          color: "var(--vscode-errorForeground)",
                          marginLeft: "16px"
                        }}>
                          Error: {provider.error}
                        </div>
                      )}
                    </div>
                  ))}
                  {activeProviders.length === 0 && (
                    <div style={{ fontSize: "12px", opacity: 0.8 }}>
                      No local providers configured
                    </div>
                  )}
                </div>
              </div>

              {/* Cloud API Providers */}
              <div>
                <h6 style={{ margin: "0 0 4px 8px", fontSize: "11px", opacity: 0.8 }}>Cloud Providers</h6>
                <div style={{
                  backgroundColor: "var(--vscode-textBlockQuote-background)",
                  padding: "8px",
                  borderRadius: "4px"
                }}>
                  <div style={{ fontSize: "12px" }}>
                    {apiConfiguration && (
                      <div style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <div style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: "var(--vscode-testing-iconPassed)"
                          }} />
                          <span>Active Provider: {apiConfiguration.apiProvider}</span>
                        </div>
                        <div style={{ fontSize: "11px", marginLeft: "16px" }}>
                          <ApiStatusDisplay metrics={metrics} />
                        </div>
                      </div>
                    )}
                    {!apiConfiguration && (
                      <div style={{ opacity: 0.8 }}>
                        No cloud providers configured
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px"}}>Commit Name</h5>
              <VSCodeTextArea
                value={prForm.commitName}
                onChange={(e) => handlePrFormChange('commitName', (e.target as HTMLTextAreaElement).value)}
                placeholder="Enter a commit name (optional - will generate ticket number if empty)"
                style={{ width: "100%", minHeight: "40px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <h5 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Additional Notes</h5>
              <VSCodeTextArea
                value={prForm.additionalNotes}
                onChange={(e) => handlePrFormChange('additionalNotes', (e.target as HTMLTextAreaElement).value)}
                placeholder="Add any additional notes for reviewers"
                style={{ width: "100%", minHeight: "80px" }}
              />
            </div>
          </div>

          {/* Debug Info Section */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <VSCodeButton onClick={handleCopyToClipboard}>
              Copy Debug Info
            </VSCodeButton>
            <VSCodeButton
              onClick={handleCheckForUpdate}
              disabled={isCheckingUpdate}
            >
              {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
            </VSCodeButton>
          </div>

          {updateMessage && (
            <div style={{
              padding: "8px",
              marginBottom: "12px",
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              border: updateMessage.includes('Update available') ?
                "1px solid var(--vscode-notificationsWarningIcon-foreground)" :
                "1px solid var(--vscode-panel-border)",
              borderRadius: "4px",
            }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "12px" }}>{updateMessage}</pre>
              {updateMessage.includes('Update available') && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  <p style={{ margin: "4px 0", fontWeight: "500" }}>To update:</p>
                  <ol style={{ margin: "4px 0 0 20px", padding: 0 }}>
                    <li>Pull changes: <code>git pull upstream main</code></li>
                    <li>Install dependencies: <code>pnpm install</code></li>
                    <li>Restart the application</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>System Information</h4>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "8px",
              padding: "8px",
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              borderRadius: "4px",
            }}>
              {Object.entries(systemInfo).map(([key, value]) => (
                <div key={key} style={{ fontSize: "12px" }}>
                  <div style={{ color: "var(--vscode-textPreformat-foreground)", marginBottom: "2px" }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div>{String(value)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>Local LLM Status</h4>
            <div style={{
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              borderRadius: "4px",
            }}>
              {activeProviders.map((provider, index) => (
                <div key={provider.name} style={{
                  padding: "8px",
                  borderBottom: index < activeProviders.length - 1 ?
                    "1px solid var(--vscode-panel-border)" : "none",
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: !provider.enabled ? "var(--vscode-charts-grey)" :
                          provider.isRunning ? "var(--vscode-testing-iconPassed)" :
                            "var(--vscode-testing-iconFailed)",
                      }} />
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "500" }}>{provider.name}</div>
                        {provider.url && (
                          <div style={{ fontSize: "11px", opacity: 0.8 }}>{provider.url}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", fontSize: "11px" }}>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: "10px",
                        backgroundColor: provider.enabled ?
                          "var(--vscode-testing-iconPassed)" : "var(--vscode-charts-grey)",
                        opacity: 0.2,
                      }}>
                        {provider.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {provider.enabled && (
                        <span style={{
                          padding: "2px 6px",
                          borderRadius: "10px",
                          backgroundColor: provider.isRunning ?
                            "var(--vscode-testing-iconPassed)" : "var(--vscode-testing-iconFailed)",
                          opacity: 0.2,
                        }}>
                          {provider.isRunning ? 'Running' : 'Not Running'}
                        </span>
                      )}
                    </div>
                  </div>
                  {provider.error && (
                    <div style={{
                      marginTop: "4px",
                      padding: "4px 8px",
                      backgroundColor: "var(--vscode-inputValidation-errorBackground)",
                      border: "1px solid var(--vscode-inputValidation-errorBorder)",
                      borderRadius: "4px",
                    }}>
                      <span style={{ fontWeight: "500" }}>Error:</span> {provider.error}
                    </div>
                  )}
                </div>
              ))}
              {activeProviders.length === 0 && (
                <div style={{
                  padding: "12px",
                  textAlign:"center",
                  fontSize: "12px",
                  opacity: 0.8,
                }}>
                  No local LLMs configured
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

// Wrap DebugView with error boundary
const WrappedDebugView: React.FC<DebugViewProps> = (props) => (
  <DebugViewErrorBoundary>
    <DebugView {...props} />
  </DebugViewErrorBoundary>
);

export default WrappedDebugView;
