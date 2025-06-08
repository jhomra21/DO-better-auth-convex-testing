import { onMount, onCleanup, createEffect, type Accessor, type JSX } from 'solid-js';
import type { OtherUserCursor } from '~/hooks/useCanvasWebSocket'; // Import the interface

// Mirror the CanvasEvent types (or import from a shared location if created)
interface CanvasEventBase {
  type: 'path' | 'text' | 'delete' | 'cursor' | 'clear' | 'undo' | 'redo' | string;
  data: any;
}
interface CanvasEvent extends CanvasEventBase {
  id: string;
  room_id: string;
  user_id: string;
  client_id: string;
  timestamp: number;
  userColor?: string; 
}

interface PathData {
  points: { x: number; y: number }[];
  strokeWidth: number;
  strokeColor: string;
  tool: CanvasTool; // Added tool property
}

// Define specific data structure for cursor events (matching hook)
interface CursorData {
  x: number;
  y: number;
}

interface CanvasProps {
  events: Accessor<CanvasEvent[]>;
  onDraw: (eventData: Omit<CanvasEventBase, 'type'> & { type: 'path', data: PathData }) => void;
  userColor?: Accessor<string | null>; // Current user's assigned color for their drawings
  onCursorMove: (position: CursorData) => void; // For sending local cursor position
  otherUserCursors: Accessor<Record<string, OtherUserCursor>>; // For receiving others' cursors
  // onCursorMove: (eventData: Omit<CanvasEventBase, 'type'> & { type: 'cursor', data: { x: number, y: number } }) => void;
  // disabled?: Accessor<boolean>; // To disable drawing if connection is down
}

// Define available tools
type CanvasTool = 'pen' | 'eraser';

export default function CanvasComponent(props: CanvasProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let currentPath: { x: number; y: number }[] = [];

  const STROKE_WIDTH = 4;
  const DEFAULT_STROKE_COLOR = '#000000'; // Will be overridden by userColor from DO/event later
  const CURSOR_RADIUS = 3;
  const DEFAULT_CURSOR_COLOR = '#888888';
  const CANVAS_BACKGROUND_COLOR = '#FFFFFF'; // Assuming a white background for eraser
  const ERASER_STROKE_WIDTH = 20;

  const [activeTool, setActiveTool] = createSignal<CanvasTool>('pen');

  const getCanvasCoordinates = (event: MouseEvent): { x: number; y: number } | null => {
    if (!canvasRef) return null;
    const rect = canvasRef.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const handleMouseDown: JSX.EventHandler<HTMLCanvasElement, MouseEvent> = (e) => {
    // if (props.disabled && props.disabled()) return;
    isDrawing = true;
    currentPath = [];
    const coords = getCanvasCoordinates(e);
    if (coords) {
      currentPath.push(coords);
    }
    // Optional: Send cursor start immediately
    // if (coords) props.onCursorMove({ type: 'cursor', data: coords }); 
  };

  const handleMouseMove: JSX.EventHandler<HTMLCanvasElement, MouseEvent> = (e) => {
    const coords = getCanvasCoordinates(e);
    if (coords) {
      props.onCursorMove(coords); // Send cursor position regardless of drawing state

      if (isDrawing) {
        // if (props.disabled && props.disabled()) return;
        currentPath.push(coords);
        // For live drawing on own canvas before sending event (optimistic update)
        if (ctx && canvasRef) {
          const currentActiveTool = activeTool();
          let optimisticColor = (props.userColor && props.userColor()) || DEFAULT_STROKE_COLOR;
          let currentStrokeWidth = STROKE_WIDTH;

          if (currentActiveTool === 'eraser') {
            optimisticColor = CANVAS_BACKGROUND_COLOR;
            currentStrokeWidth = ERASER_STROKE_WIDTH;
          }
          
          if (currentPath.length >= 2) {
            const lastPoint = currentPath[currentPath.length - 2];
            const currentPoint = currentPath[currentPath.length - 1];
            const tempCtx = canvasRef.getContext('2d'); // Get fresh context for safety
            if (tempCtx) {
              // For eraser, set composite operation to effectively erase
              if (currentActiveTool === 'eraser') {
                // tempCtx.globalCompositeOperation = 'destination-out'; // Option 1: Proper erase
                                                                      // Option 2: Draw with background color (simpler, chosen for now)
                 drawPathSegment(tempCtx, lastPoint, currentPoint, CANVAS_BACKGROUND_COLOR, currentStrokeWidth);
              } else {
                // tempCtx.globalCompositeOperation = 'source-over'; // Reset for pen
                drawPathSegment(tempCtx, lastPoint, currentPoint, optimisticColor, currentStrokeWidth);
              }
            }
          }
        }
      }
    }
  };

  // Make event parameter optional as it's not used when called directly
  const handleMouseUp = (e?: MouseEvent) => { 
    if (!isDrawing) return;
    // if (props.disabled && props.disabled()) return;
    isDrawing = false;
    if (currentPath.length > 1) {
      const currentActiveTool = activeTool();
      let eventStrokeColor = DEFAULT_STROKE_COLOR;
      let eventStrokeWidth = STROKE_WIDTH;

      if (currentActiveTool === 'eraser') {
        eventStrokeColor = CANVAS_BACKGROUND_COLOR; // Eraser event stores background color
        eventStrokeWidth = ERASER_STROKE_WIDTH;
      }

      props.onDraw({
        type: 'path',
        data: {
          points: [...currentPath],
          strokeWidth: eventStrokeWidth,
          strokeColor: eventStrokeColor, // Server will use this or override with userColor for pens
          tool: currentActiveTool,
        }
      });
    }
    currentPath = [];
    // Reset composite operation if it was changed for eraser for safety, though drawPath should handle it too
    // if (ctx && activeTool() === 'eraser') {
    //   ctx.globalCompositeOperation = 'source-over';
    // }
  };

  const handleMouseLeave = () => {
    if (isDrawing) {
       handleMouseUp();
    }
    props.onCursorMove({ x: -1, y: -1 }); // Signal cursor left
  };

  const drawPathSegment = (context: CanvasRenderingContext2D, p1: {x: number, y: number}, p2: {x: number, y: number}, color: string, width: number, tool?: CanvasTool) => {
    const originalCompositeOperation = context.globalCompositeOperation;
    if (tool === 'eraser') {
      // context.globalCompositeOperation = 'destination-out'; // Option 1 for "true" erase
                                                          // Option 2: Draw with background color (current approach)
      color = CANVAS_BACKGROUND_COLOR; // Ensure eraser always uses background color
      width = ERASER_STROKE_WIDTH;     // And eraser width
    } else {
      // context.globalCompositeOperation = 'source-over'; // Ensure pen uses source-over
    }
    
    context.beginPath();
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();

    // if (tool === 'eraser' || originalCompositeOperation !== context.globalCompositeOperation) {
    //   context.globalCompositeOperation = originalCompositeOperation; // Restore original composite operation
    // }
  };

  const drawPath = (context: CanvasRenderingContext2D, pathData: PathData) => {
    if (pathData.points.length < 2) return;

    const originalCompositeOperation = context.globalCompositeOperation;
    let colorToUse = pathData.strokeColor;
    let widthToUse = pathData.strokeWidth;

    if (pathData.tool === 'eraser') {
      // context.globalCompositeOperation = 'destination-out'; // Option 1
      colorToUse = CANVAS_BACKGROUND_COLOR; // Option 2 (current)
      widthToUse = ERASER_STROKE_WIDTH;
    } else {
      // context.globalCompositeOperation = 'source-over';
      // For pen, prioritize userColor from the event (set by DO), then pathData's own color
      // This part needs to be careful: pathData.strokeColor is from the event sender initially.
      // The `event.userColor` on the `CanvasEvent` (one level up) is what DO sets.
      // This `drawPath` is called from `redrawCanvas` where `event.userColor` is available.
      // We need to adjust how `redrawCanvas` calls `drawPath` or how `drawPath` gets the final color.
      // For now, let's assume `pathData.strokeColor` is THE color to use for pen if not eraser,
      // and `redrawCanvas` will pass the correct one (e.g., from `event.userColor`).
    }

    context.beginPath();
    context.moveTo(pathData.points[0].x, pathData.points[0].y);
    for (let i = 1; i < pathData.points.length; i++) {
      context.lineTo(pathData.points[i].x, pathData.points[i].y);
    }
    context.strokeStyle = colorToUse;
    context.lineWidth = widthToUse;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();

    // if (pathData.tool === 'eraser' || originalCompositeOperation !== context.globalCompositeOperation) {
    //  context.globalCompositeOperation = originalCompositeOperation; // Restore
    // }
  };

  const drawCursors = (context: CanvasRenderingContext2D, cursors: Record<string, OtherUserCursor>) => {
    Object.values(cursors).forEach(cursor => {
      if (cursor.x >= 0 && cursor.y >= 0) { // Only draw if coords are valid (not -1,-1)
        context.beginPath();
        context.arc(cursor.x, cursor.y, CURSOR_RADIUS, 0, 2 * Math.PI, false);
        context.fillStyle = cursor.userColor || DEFAULT_CURSOR_COLOR;
        context.fill();
      }
    });
  };

  const redrawCanvas = () => {
    if (!ctx || !canvasRef) return;
    ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
    
    // console.log("Redrawing with events:", props.events());
    props.events().forEach(event => {
      if (event.type === 'path') {
        const pathData = event.data as PathData;
        // Determine color: if pen, use event.userColor (from DO), else (eraser) use background.
        let colorForPath: string;
        let widthForPath: number;

        if (pathData.tool === 'eraser') {
          colorForPath = CANVAS_BACKGROUND_COLOR;
          widthForPath = ERASER_STROKE_WIDTH;
        } else { // 'pen' or other drawing tools
          colorForPath = event.userColor || pathData.strokeColor || DEFAULT_STROKE_COLOR;
          widthForPath = pathData.strokeWidth || STROKE_WIDTH;
        }
        // The `drawPath` function needs to be simplified or called differently.
        // Let's pass all necessary info to drawPath.
        // Redrawing the drawPath function itself to take simpler args for now:
        // drawPath(ctx!, pathData.points, colorForPath, widthForPath, pathData.tool);
        // For now, call the simplified version:
        
        // Re-simplifying: drawPath will now directly use pathData, including its tool and color.
        // If pathData.tool is 'eraser', it will use background color.
        // If pathData.tool is 'pen', it needs the correct color (userColor from event).
        // So, we'll ensure pathData passed to drawPath has the right color.
        
        const finalPathData = { ...pathData };
        if (finalPathData.tool === 'pen') {
          finalPathData.strokeColor = event.userColor || pathData.strokeColor || DEFAULT_STROKE_COLOR;
        }
        // The `drawPath` function will internally handle eraser color and width.

        drawPath(ctx!, finalPathData);
      }
      // TODO: Handle other event types (text, shapes, cursors etc.)
    });

    drawCursors(ctx!, props.otherUserCursors());
  };

  onMount(() => {
    if (canvasRef) {
      ctx = canvasRef.getContext('2d');
      // Set canvas dimensions (can be responsive later)
      // For now, fixed or based on parent
      const parent = canvasRef.parentElement;
      if (parent) {
        canvasRef.width = parent.clientWidth;
        canvasRef.height = parent.clientHeight;
      }
      redrawCanvas(); // Initial draw in case there are pre-existing events
    }
  });

  // Redraw when events change
  createEffect(() => {
    // This effect will run whenever props.events() changes.
    // We need to be careful: if we also optimistically draw local user input,
    // this might cause double drawing or flickering if not handled well.
    // For now, a full redraw on any event change is simple.
    if (ctx && canvasRef) { // Ensure ctx and canvasRef are available before redrawing
      redrawCanvas();
    }
  });

  // Redraw when otherUserCursors change
  createEffect(() => {
    // Accessing props.otherUserCursors() establishes reactivity
    const currentCursors = props.otherUserCursors();
    if (ctx && canvasRef) {
      // We only need to redraw the part of the canvas where cursors might be,
      // but for simplicity now, we redraw everything. 
      // A more optimized approach would be to clear only old cursor positions 
      // and draw new ones, or use a separate layer for cursors.
      redrawCanvas(); 
    }
  });

  // Handle window resize to redraw canvas (optional, but good for UX)
  const handleResize = () => {
    if (canvasRef && canvasRef.parentElement) {
      canvasRef.width = canvasRef.parentElement.clientWidth;
      canvasRef.height = canvasRef.parentElement.clientHeight;
      if (ctx) { // Ensure ctx is available before redrawing
        redrawCanvas();
      }
    }
  };

  onMount(() => {
    window.addEventListener('resize', handleResize);
  });

  onCleanup(() => {
    window.removeEventListener('resize', handleResize);
  });

  return (
    <div class="flex flex-col h-full">
      <div class="p-2 flex space-x-2 bg-gray-100 dark:bg-gray-700 border-b border-border">
        <button 
          onClick={() => setActiveTool('pen')}
          class={`px-3 py-1 rounded text-sm
                    ${activeTool() === 'pen' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
        >
          Pen
        </button>
        <button 
          onClick={() => setActiveTool('eraser')}
          class={`px-3 py-1 rounded text-sm
                    ${activeTool() === 'eraser' ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'}`}
        >
          Eraser
        </button>
        {/* Add more tools here */}
      </div>
      <canvas 
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp as JSX.EventHandler<HTMLCanvasElement, MouseEvent>} // Cast if signature differs due to optional param
        onMouseLeave={handleMouseLeave}
        class="w-full h-full touch-none bg-white dark:bg-gray-800 rounded-md shadow-inner"
        // Consider adding tabindex for keyboard accessibility if needed later
      />
    </div>
  );
} 