import { createEffect, createSignal, on, onCleanup, onMount, type Accessor } from 'solid-js';
import type { CanvasEvent, CursorData, OtherUserCursor } from '~/hooks/useCanvasWebSocket'; // Assuming types are exported or moved
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';

// Re-define or import types if they are not accessible here
// For simplicity, ensure CanvasEvent is available, e.g., from the hook's export or a shared types file.

interface CanvasComponentProps {
  events: CanvasEvent[];
  userColor: string | null;
  clientId: string;
  onDraw: (event: CanvasEvent) => void;
  onCursorMove: (position: CursorData) => void;
  otherUserCursors: Record<string, OtherUserCursor>;
  roomId: string;
}

export function CanvasComponent(props: CanvasComponentProps) {
  let canvasRef!: HTMLCanvasElement;
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [currentPath, setCurrentPath] = createSignal<Array<{x: number, y: number}>>([]);
  const [startPoint, setStartPoint] = createSignal<{x: number, y: number} | null>(null);

  // Tool state
  type Tool = 'pen' | 'eraser';
  const [selectedTool, setSelectedTool] = createSignal<Tool>('pen');
  const [currentLineWidth, setCurrentLineWidth] = createSignal(selectedTool() === 'pen' ? 2 : 20);

  let resizeObserver: ResizeObserver | null = null;

  const drawPath = (
    ctx: CanvasRenderingContext2D,
    points: Array<{x: number, y: number}>,
    strokeColor: string,
    lineWidth: number
  ) => {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const redrawCanvas = () => {
    if (!canvasRef) {
      console.log("CanvasComponent: redrawCanvas called, but canvasRef is not yet available. Skipping. RoomId:", props.roomId);
      return;
    }
    const ctx = canvasRef.getContext('2d');
    if (!ctx) {
      console.error("CanvasComponent: Failed to get 2D context. RoomId:", props.roomId);
      return;
    }
    if (canvasRef.width === 0 || canvasRef.height === 0) {
      console.warn(`CanvasComponent: redrawCanvas called for RoomId: ${props.roomId}, but canvas dimensions are 0x0. This might indicate layout issues. Will attempt to draw anyway.`);
      // No longer attempting resize here, ResizeObserver should handle it.
    }
    const eventsToDraw = props.events;
    // console.log(`CanvasComponent: redrawCanvas executing for RoomId: ${props.roomId}. Canvas dims: ${canvasRef.width}x${canvasRef.height}. Drawing ${eventsToDraw.length} events. First 5:`, JSON.stringify(eventsToDraw.slice(0, 5)));
    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);

    eventsToDraw.forEach(event => {
      if (event.type === 'path' && event.data.points) {
        const color = event.userColor || event.data.strokeColor || '#000000';
        drawPath(ctx, event.data.points, color, event.data.lineWidth || 2);
      }
      // TODO: Handle other event types like 'text', 'clear', etc.
    });

    // Draw other users' cursors
    Object.values(props.otherUserCursors).forEach(cursor => {
      if (cursor.clientId !== props.userColor) { // Assuming userColor is unique enough for client ID here, or use actual clientId from hook
        ctx.fillStyle = cursor.userColor || '#cccccc';
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText(cursor.clientId.substring(0,6), cursor.x + 8, cursor.y - 8); // Display part of clientId for identification
      }
    });
  };
  
  const resizeCanvas = () => {
    if (!canvasRef) {
      console.warn("CanvasComponent: resizeCanvas called, but canvasRef is not available. RoomId:", props.roomId);
      return;
    }
    const newWidth = canvasRef.offsetWidth;
    const newHeight = canvasRef.offsetHeight;

    if (newWidth > 0 && newHeight > 0) {
      if (canvasRef.width !== newWidth || canvasRef.height !== newHeight) {
        canvasRef.width = newWidth;
        canvasRef.height = newHeight;
        console.log(`CanvasComponent: resizeCanvas set new dimensions for RoomId: ${props.roomId} (new width: ${canvasRef.width}, height: ${canvasRef.height}). Redrawing.`);
        redrawCanvas();
      } else {
        // console.log(`CanvasComponent: resizeCanvas called for RoomId: ${props.roomId}, but dimensions (${newWidth}x${newHeight}) are already set. No redraw needed from resize.`);
      }
    } else {
      console.warn(`CanvasComponent: resizeCanvas called for RoomId: ${props.roomId}, but offsetWidth/Height is 0 (${newWidth}x${newHeight}). Canvas might not be visible or laid out. No resize/redraw.`);
    }
  };

  onMount(() => {
    if (canvasRef) {
      console.log(`CanvasComponent: onMount. canvasRef is assigned. Current props.roomId: ${props.roomId}. Setting up ResizeObserver.`);
      
      resizeObserver = new ResizeObserver(entries => {
        // We are only observing one element, so we can just use entries[0]
        if (entries && entries.length > 0) {
          // const { width, height } = entries[0].contentRect;
          console.log(`CanvasComponent: ResizeObserver detected size change for RoomId: ${props.roomId}. Calling resizeCanvas.`);
          resizeCanvas(); // resizeCanvas will use offsetWidth/Height
        }
      });
      resizeObserver.observe(canvasRef);

      // Initial call attempt, ResizeObserver will correct it if needed
      // requestAnimationFrame(() => {
      //   console.log(`CanvasComponent: onMount (requestAnimationFrame) for RoomId: ${props.roomId}. Calling resizeCanvas.`);
      //   resizeCanvas(); 
      // });

      window.addEventListener('resize', resizeCanvas); // For window-level resizes
    } else {
      console.error("CanvasComponent: onMount, but canvasRef is STILL NOT ready! RoomId:", props.roomId);
    }
  });

  onCleanup(() => {
    console.log("CanvasComponent: onCleanup. RoomId:", props.roomId);
    window.removeEventListener('resize', resizeCanvas);
    if (resizeObserver && canvasRef) {
      resizeObserver.unobserve(canvasRef);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
      console.log("CanvasComponent: ResizeObserver disconnected.");
    }
  });

  // Effect to react to roomId changes specifically
  createEffect(on(() => props.roomId, (newRoomId, oldRoomId) => {
    // defer: true makes this run only on changes, not initial mount
    console.log(`CanvasComponent: props.roomId changed from '${oldRoomId}' to '${newRoomId}'.`);
    if (newRoomId && oldRoomId !== undefined && newRoomId !== oldRoomId) { // Ensure it's a genuine change from a previous valid room
      if (canvasRef) {
        console.log(`CanvasComponent: roomId has changed. Forcing resize and redraw for new room: ${newRoomId}. Events length when roomId changed: ${props.events.length}`);
        // The ResizeObserver should pick up any layout changes due to new room content/styling.
        // We might still want an explicit resizeCanvas if styles affecting size are applied directly based on roomId.
        resizeCanvas(); 
      } else {
        console.warn(`CanvasComponent: roomId changed to ${newRoomId}, but canvasRef not ready yet for re-initialization.`);
      }
    } else if (oldRoomId === undefined && newRoomId) {
      console.log(`CanvasComponent: props.roomId initialized to '${newRoomId}'. onMount/ResizeObserver should handle initial setup.`);
    }
  }, { defer: true }));

  // Effect for event, cursor, tool changes
  createEffect(on([() => props.events, () => props.otherUserCursors, () => selectedTool()], 
    (currentValues) => {
      const [newEvents, newCursors, newTool] = currentValues;
      if (!canvasRef) {
        console.log("CanvasComponent: createEffect (events/cursors/tool) triggered, but canvasRef not ready. Skipping redraw. RoomId:", props.roomId);
        return;
      }
      console.log(`CanvasComponent: createEffect (events/cursors/tool) triggered for RoomId: ${props.roomId}. Calling redrawCanvas. Events: ${newEvents.length}, Cursors: ${Object.keys(newCursors).length}, Tool: ${newTool}`);
      redrawCanvas();
      setCurrentLineWidth(newTool === 'pen' ? 2 : 20);
    }
  ));

  const handleMouseDown = (e: MouseEvent) => {
    if (!canvasRef) return;
    setIsDrawing(true);
    const newStartPoint = { x: e.offsetX, y: e.offsetY };
    setStartPoint(newStartPoint);
    setCurrentPath([newStartPoint]);
    props.onCursorMove({ x: e.offsetX, y: e.offsetY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    props.onCursorMove({ x: e.offsetX, y: e.offsetY });
    if (!isDrawing() || !startPoint() || !canvasRef) return;

    const currentPoint = { x: e.offsetX, y: e.offsetY };
    setCurrentPath(prevPath => [...prevPath, currentPoint]);

    const ctx = canvasRef.getContext('2d');
    if (ctx && currentPath().length >=2) {
      const pointsToDraw = currentPath().slice(-2);
      drawPath(ctx, pointsToDraw, props.userColor || (selectedTool() === 'pen' ? '#000000' : '#FFFFFF'), currentLineWidth());
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing() || !startPoint()) return;
    
    const finalPath = currentPath();
    if (finalPath.length >= 2) { // Only send event if path has at least two points
      const pathEvent: CanvasEvent = {
        id: crypto.randomUUID(), // Client-side ID, server will assign its own if needed or use this
        room_id: props.roomId,
        user_id: '', // Server should fill this from auth context
        client_id: props.clientId,
        timestamp: Date.now(),
        userColor: props.userColor || (selectedTool() === 'pen' ? '#000000' : '#FFFFFF'), // Send current color
        type: selectedTool() === 'pen' ? 'path' : 'path', // Eraser is also a path, but with white color / different compositing
        data: {
          points: finalPath,
          strokeColor: selectedTool() === 'pen' ? (props.userColor || '#000000') : '#FFFFFF', // Eraser is effectively a white path
          lineWidth: currentLineWidth(),
          tool: selectedTool(), // Send tool used
        },
      };
      props.onDraw(pathEvent);
    }

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPath([]);
  };

  const handleMouseLeave = () => {
    if (isDrawing()) {
      handleMouseUp(); // Finalize drawing if mouse leaves canvas while drawing
    }
    // Optionally send a "cursor_leave" event or clear local cursor display for this user
  };

  const selectTool = (tool: Tool) => {
    setSelectedTool(tool);
  };

  return (
    <div class="flex flex-col w-full h-full bg-gray-800 rounded-md overflow-hidden relative">
      <div class="absolute top-2 left-2 z-10 flex space-x-1 bg-gray-700 p-1 rounded-md shadow">
        <Tooltip>
          <TooltipTrigger>
            <Button variant="outline" size="icon" onClick={() => selectTool('pen')}
                    class={selectedTool() === 'pen' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-500'}>
              <Icon name="stickynote" class="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pen (Sticky Note)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <Button variant="outline" size="icon" onClick={() => selectTool('eraser')}
                    class={selectedTool() === 'eraser' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-600 hover:bg-gray-500'}>
              <Icon name="x" class="w-5 h-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Eraser (X)</TooltipContent>
        </Tooltip>
        {/* Add more tools: color picker, line width slider, clear button */}
      </div>
      <canvas
        ref={canvasRef}
        class="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave} // Handle mouse leaving the canvas
      />
      {/* <div class="absolute bottom-2 left-2 text-xs text-gray-400">Tool: {selectedTool()}, Width: {currentLineWidth()}</div> */}
    </div>
  );
}

// Helper to generate a simple random color (used for initial assignment in DO if not provided)
// export const getRandomHexColor = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'); 