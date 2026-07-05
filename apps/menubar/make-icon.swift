/**
 * Renders the wrud app icon - dark-green rounded square + lime "W" (the dashboard's brand
 * colors #16231d / #b6f24e) - as a 1024px PNG with the Big Sur-style transparent margin.
 * Run by build.sh (`swift make-icon.swift <out.png>`), which sips/iconutils it into AppIcon.icns.
 */
import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png"
let S: CGFloat = 1024

let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: Int(S), pixelsHigh: Int(S),
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

// Big Sur icon grid: ~10% transparent margin, ~22.5% corner radius
let margin = S * 0.098
let box = NSRect(x: margin, y: margin, width: S - 2 * margin, height: S - 2 * margin)
NSColor(srgbRed: 0x16 / 255.0, green: 0x23 / 255.0, blue: 0x1d / 255.0, alpha: 1).setFill()
NSBezierPath(roundedRect: box, xRadius: box.width * 0.225, yRadius: box.width * 0.225).fill()

let lime = NSColor(srgbRed: 0xb6 / 255.0, green: 0xf2 / 255.0, blue: 0x4e / 255.0, alpha: 1)
let str = NSAttributedString(
  string: "W",
  attributes: [.font: NSFont.systemFont(ofSize: S * 0.55, weight: .black), .foregroundColor: lime])
let sz = str.size()
str.draw(at: NSPoint(x: (S - sz.width) / 2, y: (S - sz.height) / 2))

NSGraphicsContext.current?.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
