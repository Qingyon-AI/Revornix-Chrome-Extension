import { createContext, useContext } from 'react';

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
	children,
	container,
}: {
	children: React.ReactNode;
	container: HTMLElement | null;
}) {
	return (
		<PortalContainerContext.Provider value={container}>
			{children}
		</PortalContainerContext.Provider>
	);
}

export function usePortalContainer() {
	return useContext(PortalContainerContext);
}
