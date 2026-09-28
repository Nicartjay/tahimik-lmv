import { H, SCALE, W } from './config';
import { gl } from './gl';

/**
 * A Canvas2D drawing surface in logical px (context is pre-scaled by SCALE) that
 * uploads as a premultiplied sRGB texture. begin() clears and resets all state.
 */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: WebGLTexture;
  constructor(public w = W, public h = H, public scale = SCALE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  begin(): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
    c.letterSpacing = '0px';
    c.fontStretch = 'normal';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    c.setLineDash([]);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    return c;
  }
  upload(): WebGLTexture {
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return this.tex;
  }
}
