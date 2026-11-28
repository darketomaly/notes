import { type Connection, type Point } from "./model";

export function getElementCenter(element: HTMLElement): Point {
	return {
		x: element.offsetLeft + element.offsetWidth / 2,
		y: element.offsetTop + element.offsetHeight / 2,
	};
}

export function getClosestEdgeAnchor(element: HTMLElement, targetPoint: Point): Point {
	const center = getElementCenter(element);
	const dx = targetPoint.x - center.x;
	const dy = targetPoint.y - center.y;

	if (Math.abs(dx) >= Math.abs(dy)) {
		return {
			x: dx >= 0 ? element.offsetLeft + element.offsetWidth : element.offsetLeft,
			y: center.y,
		};
	}

	return {
		x: center.x,
		y: dy >= 0 ? element.offsetTop + element.offsetHeight : element.offsetTop,
	};
}

interface RenderConnectionsLayerOptions {
	connections: Connection[];
	itemElements: Map<string, HTMLElement>;
	connectionsPermanent: SVGGElement;
	svgNs: string;
	markerEnd: string;
}

export function renderConnectionsLayer({
	connections,
	itemElements,
	connectionsPermanent,
	svgNs,
	markerEnd,
}: RenderConnectionsLayerOptions): Connection[] {
	connectionsPermanent.replaceChildren();

	const filteredConnections = connections.filter(
		(connection) =>
			itemElements.has(connection.fromItemId) && itemElements.has(connection.toItemId),
	);

	for (const connection of filteredConnections) {
		const fromElement = itemElements.get(connection.fromItemId);
		const toElement = itemElements.get(connection.toItemId);
		if (!fromElement || !toElement) {
			continue;
		}

		const fromCenter = getElementCenter(fromElement);
		const toCenter = getElementCenter(toElement);
		const from = getClosestEdgeAnchor(fromElement, toCenter);
		const to = getClosestEdgeAnchor(toElement, fromCenter);

		const hitLine = document.createElementNS(svgNs, "line");
		hitLine.setAttribute("x1", String(from.x));
		hitLine.setAttribute("y1", String(from.y));
		hitLine.setAttribute("x2", String(to.x));
		hitLine.setAttribute("y2", String(to.y));
		hitLine.classList.add("connection-hit-area");
		hitLine.dataset.connectionId = connection.id;

		const line = document.createElementNS(svgNs, "line");
		line.setAttribute("x1", String(from.x));
		line.setAttribute("y1", String(from.y));
		line.setAttribute("x2", String(to.x));
		line.setAttribute("y2", String(to.y));
		line.classList.add("connection-line");
		line.dataset.connectionId = connection.id;
		line.setAttribute("marker-end", markerEnd);

		connectionsPermanent.appendChild(hitLine);
		connectionsPermanent.appendChild(line);
	}

	return filteredConnections;
}
