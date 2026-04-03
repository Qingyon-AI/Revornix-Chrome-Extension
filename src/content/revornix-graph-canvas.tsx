// @ts-nocheck
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

type GraphNode = {
	id: string;
	text: string;
	degree?: number;
};

type GraphEdge = {
	src_node: string;
	tgt_node: string;
};

interface RevornixGraphCanvasProps {
	nodes: GraphNode[];
	edges: GraphEdge[];
	className?: string;
}

type SimulationNode = GraphNode & {
	x?: number;
	y?: number;
	vx?: number;
	vy?: number;
	fx?: number | null;
	fy?: number | null;
	renderRadius: number;
};

type SimulationLink = {
	source: string | SimulationNode;
	target: string | SimulationNode;
};

function getNodePosition(value: string | SimulationNode) {
	return typeof value === 'string' ? null : value;
}

function truncateLabel(label: string, limit: number) {
	if (label.length <= limit) {
		return label;
	}
	return `${label.slice(0, Math.max(0, limit - 1))}…`;
}

export function RevornixGraphCanvas({
	nodes: inputNodes,
	edges: inputEdges,
	className,
}: RevornixGraphCanvasProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const hasInteractedRef = useRef(false);

	useEffect(() => {
		const svgElement = svgRef.current;
		if (!svgElement) {
			return;
		}

		const nodes: SimulationNode[] = inputNodes.map((node) => ({
			...node,
			renderRadius: 12,
		}));
		const edges: SimulationLink[] = inputEdges.map((edge) => ({
			source: edge.src_node,
			target: edge.tgt_node,
		}));

		const svg = d3.select(svgElement);
		svg.selectAll('*').remove();

		if (nodes.length === 0) {
			return;
		}

		const parent = svgElement.parentElement;
		const width = parent?.clientWidth || 320;
		const height = parent?.clientHeight || 280;
		const degreeExtent = d3.extent(nodes, (node) => node.degree ?? 1) as [number, number];
		const radiusScale = d3
			.scaleLinear()
			.domain(
				degreeExtent[0] === degreeExtent[1]
					? [degreeExtent[0], degreeExtent[0] + 1]
					: degreeExtent
			)
			.range(nodes.length > 40 ? [7, 13] : [8, 16]);

		nodes.forEach((node, index) => {
			node.renderRadius = radiusScale(node.degree ?? 1);
			const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
			const spread = Math.min(width, height) * 0.22;
			node.x = width / 2 + Math.cos(angle) * spread;
			node.y = height / 2 + Math.sin(angle) * spread;
		});

		svg
			.attr('width', width)
			.attr('height', height)
			.attr('viewBox', `0 0 ${width} ${height}`)
			.attr('style', 'width: 100%; height: 100%;');

		const graphRoot = svg.append('g').attr('class', 'graph-root');

		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.52, 2.2])
			.on('zoom', (event) => {
				if (event.sourceEvent) {
					hasInteractedRef.current = true;
				}
				graphRoot.attr('transform', event.transform.toString());
			});

		svg.call(zoom).on('dblclick.zoom', null);

		const linkElements = graphRoot
			.append('g')
			.attr('fill', 'none')
			.selectAll('line')
			.data(edges)
			.join('line')
			.attr('stroke', 'rgba(148,163,184,0.34)')
			.attr('stroke-width', 1.1)
			.attr('stroke-linecap', 'round');

		const nodeGroup = graphRoot.append('g');

		const nodeElements = nodeGroup
			.selectAll<SVGCircleElement, SimulationNode>('circle')
			.data(nodes)
			.join('circle')
			.attr('r', (node: SimulationNode) => node.renderRadius)
			.attr('fill', (node: SimulationNode) =>
				d3.interpolateLab('#103245', '#67e8f9')(
					(radiusScale(node.degree ?? 1) - radiusScale.range()[0]) /
						Math.max(radiusScale.range()[1] - radiusScale.range()[0], 1)
				)
			)
			.attr('stroke', 'rgba(248,250,252,0.92)')
			.attr('stroke-width', 1.4)
			.style('cursor', 'grab')
			.call(
				d3
					.drag<SVGCircleElement, SimulationNode>()
					.on(
						'start',
						(event: {
							active: boolean;
							subject: SimulationNode;
						}) => {
						hasInteractedRef.current = true;
						if (!event.active) {
							simulation.alphaTarget(0.15).restart();
						}
						event.subject.fx = event.subject.x;
						event.subject.fy = event.subject.y;
						}
					)
					.on(
						'drag',
						(event: {
							subject: SimulationNode;
							x: number;
							y: number;
						}) => {
						event.subject.fx = event.x;
						event.subject.fy = event.y;
						}
					)
					.on(
						'end',
						(event: {
							active: boolean;
							subject: SimulationNode;
						}) => {
						if (!event.active) {
							simulation.alphaTarget(0);
						}
						event.subject.fx = null;
						event.subject.fy = null;
						}
					)
			);

		const labelElements = graphRoot
			.append('g')
			.selectAll('text')
			.data(nodes)
			.join('text')
			.text((node: SimulationNode) => truncateLabel(node.text, nodes.length > 32 ? 12 : 16))
			.attr('font-size', nodes.length > 32 ? 10 : 11)
			.attr('font-weight', 500)
			.attr('text-anchor', 'middle')
			.attr('fill', 'rgba(248,250,252,0.92)')
			.style('pointer-events', 'none');

		const simulation = d3
			.forceSimulation<SimulationNode>(nodes)
			.force(
				'link',
				d3
					.forceLink<SimulationNode, SimulationLink>(edges)
					.id((node: SimulationNode) => node.id)
					.distance(nodes.length > 60 ? 42 : 56)
					.strength(nodes.length > 60 ? 0.18 : 0.24)
			)
			.force('charge', d3.forceManyBody().strength(nodes.length > 60 ? -90 : -140))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force(
				'collision',
				d3
					.forceCollide<SimulationNode>()
					.radius((node: SimulationNode) => node.renderRadius + 14)
			)
			.force('x', d3.forceX(width / 2).strength(0.04))
			.force('y', d3.forceY(height / 2).strength(0.04))
			.on('tick', () => {
				linkElements
					.attr('x1', (edge: SimulationLink) => (edge.source as SimulationNode).x ?? 0)
					.attr('y1', (edge: SimulationLink) => (edge.source as SimulationNode).y ?? 0)
					.attr('x2', (edge: SimulationLink) => (edge.target as SimulationNode).x ?? 0)
					.attr('y2', (edge: SimulationLink) => (edge.target as SimulationNode).y ?? 0);

				nodeElements
					.attr('cx', (node: SimulationNode) => node.x ?? 0)
					.attr('cy', (node: SimulationNode) => node.y ?? 0);

				labelElements
					.attr('x', (node: SimulationNode) => node.x ?? 0)
					.attr('y', (node: SimulationNode) => (node.y ?? 0) + (node.renderRadius + 14));
			});

		const fitGraphToViewport = () => {
			if (hasInteractedRef.current) {
				return;
			}
			const positionedNodes = nodes.filter(
				(node) => typeof node.x === 'number' && typeof node.y === 'number'
			);
			if (positionedNodes.length === 0) {
				return;
			}

			const minX = d3.min(positionedNodes, (node: SimulationNode) => (node.x ?? 0) - node.renderRadius) ?? 0;
			const maxX = d3.max(positionedNodes, (node: SimulationNode) => (node.x ?? 0) + node.renderRadius) ?? width;
			const minY = d3.min(positionedNodes, (node: SimulationNode) => (node.y ?? 0) - node.renderRadius) ?? 0;
			const maxY = d3.max(positionedNodes, (node: SimulationNode) => (node.y ?? 0) + node.renderRadius + 18) ?? height;

			const graphWidth = Math.max(maxX - minX, 1);
			const graphHeight = Math.max(maxY - minY, 1);
			const padding = Math.min(width, height) * 0.12;
			const scale = Math.max(
				0.52,
				Math.min(
					1.18,
					(width - padding * 2) / graphWidth,
					(height - padding * 2) / graphHeight
				)
			);
			const translateX = width / 2 - ((minX + maxX) / 2) * scale;
			const translateY = height / 2 - ((minY + maxY) / 2) * scale;
			const nextTransform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
			svg.call(zoom.transform, nextTransform);
		};

		window.setTimeout(() => {
			fitGraphToViewport();
		}, 220);

		return () => {
			simulation.stop();
			svg.on('.zoom', null);
		};
	}, [inputEdges, inputNodes]);

	return <svg ref={svgRef} className={className} />;
}
