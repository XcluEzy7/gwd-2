import type { Model } from "@gsd/pi-ai";

export interface ModelCandidateOptions {
	force?: boolean;
	includeScopedSessionModels?: boolean;
}

function getDiscoveryRefreshCadenceMs(host: any): number | undefined {
	return host.settingsManager?.getModelDiscoveryRefreshCadenceMs?.();
}

export async function handleModelCommand(
	host: any,
	searchTerm?: string,
): Promise<void> {
	if (!searchTerm) {
		host.showModelSelector();
		return;
	}

	const model = await findExactModelMatch(host, searchTerm);
	if (model) {
		try {
			await host.session.setModel(model);
			host.footer.invalidate();
			host.updateEditorBorderColor();
			host.showStatus(`Model: ${model.id}`);
			host.checkDaxnutsEasterEgg(model);
		} catch (error) {
			host.showError(error instanceof Error ? error.message : String(error));
		}
		return;
	}

	host.showModelSelector(searchTerm);
}

export async function findExactModelMatch(
	host: any,
	searchTerm: string,
): Promise<Model<any> | undefined> {
	const term = searchTerm.trim();
	if (!term) return undefined;

	let targetProvider: string | undefined;
	let targetModelId = "";

	if (term.includes("/")) {
		const parts = term.split("/", 2);
		targetProvider = parts[0]?.trim().toLowerCase();
		targetModelId = parts[1]?.trim().toLowerCase() ?? "";
	} else {
		targetModelId = term.toLowerCase();
	}

	if (!targetModelId) return undefined;

	const models = await getModelCandidates(host);
	const exactMatches = models.filter((item) => {
		const idMatch = item.id.toLowerCase() === targetModelId;
		const providerMatch =
			!targetProvider || item.provider.toLowerCase() === targetProvider;
		return idMatch && providerMatch;
	});

	return exactMatches.length === 1 ? exactMatches[0] : undefined;
}

export async function prepareModelCandidates(
	host: any,
	options: ModelCandidateOptions = {},
): Promise<Model<any>[]> {
	if (
		options.includeScopedSessionModels !== false &&
		host.session.scopedModels.length > 0
	) {
		return host.session.scopedModels.map((scoped: any) => scoped.model);
	}

	try {
		await host.session.modelRegistry.prepareDiscoveryRefresh({
			force: options.force,
			minTimeSinceLastFetchMs: options.force
				? undefined
				: getDiscoveryRefreshCadenceMs(host),
		});
		return host.session.modelRegistry
			.getAllWithDiscovered()
			.filter((model: Model<any>) =>
				host.session.modelRegistry.isProviderRequestReady(model.provider),
			);
	} catch {
		return [];
	}
}

export async function getModelCandidates(host: any): Promise<Model<any>[]> {
	return prepareModelCandidates(host);
}

export async function updateAvailableProviderCount(host: any): Promise<void> {
	const models = await prepareModelCandidates(host, {
		includeScopedSessionModels: false,
	});
	const uniqueProviders = new Set(models.map((m) => m.provider));
	host.footerDataProvider.setAvailableProviderCount(uniqueProviders.size);
}
