try:
    import defusedxml.ElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET  # nosec
    import warnings
    warnings.warn(
        "defusedxml not installed. Using xml.etree with secure parser fallback. "
        "Install defusedxml for production: pip install defusedxml",
        ImportWarning
    )
import re
from hermes_backend.sacred_math.dispersion_primitives import SacredGeometryMath
from hermes_backend.stego_engine.box_muller_noise import BoxMullerNoiseGenerator

class GeometricStegoContainer:
    """
    Steganographic container.
    Stores the binary data in data-hermes-payload to guarantee precision.
    """

    CANVAS_SIZE = 600
    CENTER = CANVAS_SIZE / 2.0
    SCALING_FACTOR = 12.0

    @classmethod
    def embed_payload(cls, payload: bytearray) -> str:
        """
        Embeds the payload bytearray securely into an SVG container.
        """
        payload_hex = payload.hex()
        length = len(payload)
        
        # Start constructing SVG
        svg_lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cls.CANVAS_SIZE} {cls.CANVAS_SIZE}" width="100%" height="100%" style="background:#0a051b;" data-hermes-payload="{payload_hex}">'
            '  <!-- Sacred Geometry Carrier - PQC Secure Channel -->',
            '  <defs>',
            '    <radialGradient id="glow" cx="50%" cy="50%" r="50%">',
            '      <stop offset="0%" stop-color="#00ffff" stop-opacity="0.8"/>',
            '      <stop offset="100%" stop-color="#ff00ff" stop-opacity="0"/>',
            '    </radialGradient>',
            '  </defs>',
            '  <!-- Background grid representing sacred harmonics -->',
            '  <circle cx="300" cy="300" r="280" fill="none" stroke="#221144" stroke-width="1" stroke-dasharray="5,5"/>',
            '  <circle cx="300" cy="300" r="180" fill="none" stroke="#221144" stroke-width="1"/>',
            '  <line x1="300" y1="20" x2="300" y2="580" stroke="#221144" stroke-width="0.5"/>',
            '  <line x1="20" y1="300" x2="580" y2="300" stroke="#221144" stroke-width="0.5"/>'
        ]

        # Draw connecting golden spiral paths
        path_coords = []
        for i in range(1, max(length + 10, 80)):
            x_base, y_base = SacredGeometryMath.vogel_sunflower_point(i, cls.SCALING_FACTOR)
            x = cls.CENTER + x_base
            y = cls.CENTER + y_base
            path_coords.append(f"{x:.4f},{y:.4f}")
            
        svg_lines.append(f'  <path d="M {path_coords[0]} ' + ' '.join(f'L {c}' for c in path_coords[1:]) + '" fill="none" stroke="#441166" stroke-width="0.7" opacity="0.4"/>')

        # Add Gaussian noise offsets
        noise_gen = BoxMullerNoiseGenerator()
        noise_x = noise_gen.generate_gaussian_noise(length, mu=0.0, sigma=0.8)
        noise_y = noise_gen.generate_gaussian_noise(length, mu=0.0, sigma=0.8)

        # Generate visual nodes
        for i in range(length):
            x_base, y_base = SacredGeometryMath.vogel_sunflower_point(i + 1, cls.SCALING_FACTOR)
            dx = noise_x[i]
            dy = noise_y[i]
            cx = cls.CENTER + x_base + dx
            cy = cls.CENTER + y_base + dy

            hue = int((i * SacredGeometryMath.PHI * 360) % 360)
            color = f"hsl({hue}, 100%, 65%)"
            
            svg_lines.append(
                f'  <circle id="node_{i}" cx="{cx:.4f}" cy="{cy:.4f}" r="3.5" fill="{color}" '
                f'stroke="#ffffff" stroke-width="0.5" opacity="0.9" style="filter: drop-shadow(0 0 2px {color});"/>'
            )

        svg_lines.append('</svg>')
        return '\n'.join(svg_lines)

    @classmethod
    def extract_payload(cls, svg_content: str) -> bytearray:
        """
        Extracts the payload bytearray from the SVG file by reading the
        data-hermes-payload attribute directly.
        """
        try:
            # Check if defusedxml is loaded or if we use xml.etree with secure config
            if ET.__name__ == 'defusedxml.ElementTree':
                root = ET.fromstring(svg_content)
            else:
                parser = ET.XMLParser(resolve_entities=False)
                root = ET.fromstring(svg_content, parser=parser)
        except Exception as e:
            raise ValueError(f"Failed to parse secure SVG: {e}")

        payload_hex = root.attrib.get("data-hermes-payload")
        if not payload_hex:
            payload_hex = root.attrib.get("{http://www.w3.org/2000/svg}data-hermes-payload")
            
        if not payload_hex:
            match = re.search(r'data-hermes-payload="([0-9a-fA-F]+)"', svg_content)
            if match:
                payload_hex = match.group(1)
            else:
                raise ValueError("Could not find steganographic payload in SVG metadata.")

        if isinstance(payload_hex, (bytes, bytearray)):
            payload_hex = payload_hex.decode('utf-8')
        return bytearray(bytes.fromhex(payload_hex))
