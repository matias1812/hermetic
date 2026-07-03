#!/usr/bin/env python3
"""
Generador de Matriz de Trazabilidad Automatizado.
Verifica que cada requisito tiene implementación, tests y verificación.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List

class TraceabilityMatrix:
    """
    Matriz de trazabilidad requisitos → código → tests → verificación.
    """
    
    def __init__(self, requirements_file: str):
        with open(requirements_file) as f:
            data = json.load(f)
        self.requirements = data['requirements']
        self.issues = []
    
    def verify_traceability(self) -> bool:
        """Verifica trazabilidad completa de todos los requisitos."""
        all_ok = True
        
        for req in self.requirements:
            req_id = req['id']
            issues_for_req = []
            
            # Verificar implementación
            if not req.get('implemented_by'):
                issues_for_req.append(f"{req_id}: SIN implementación registrada")
            
            # Verificar tests
            if not req.get('tested_by'):
                issues_for_req.append(f"{req_id}: SIN tests registrados")
            
            # Verificar verificación formal (solo para CRITICAL)
            if req['priority'] == 'CRITICAL' and not req.get('verified_by'):
                issues_for_req.append(
                    f"{req_id}: CRÍTICO - SIN verificación formal"
                )
            
            # Verificar análisis estático
            if not req.get('static_analysis'):
                issues_for_req.append(
                    f"{req_id}: SIN análisis estático configurado"
                )
            
            if issues_for_req:
                self.issues.extend(issues_for_req)
                all_ok = False
        
        return all_ok
    
    def generate_report(self) -> str:
        """Genera reporte de trazabilidad en formato Markdown."""
        report = []
        report.append("# 📋 Matriz de Trazabilidad\n")
        report.append("| Requisito | Prioridad | Implementación | Tests | Verificación Formal | Análisis Estático |")
        report.append("|-----------|-----------|----------------|-------|---------------------|-------------------|")
        
        for req in self.requirements:
            impl = ", ".join(req.get('implemented_by', ['❌']))[:50]
            tests = ", ".join(req.get('tested_by', ['❌']))[:50]
            verify = ", ".join(req.get('verified_by', ['❌']))[:50]
            static = ", ".join(req.get('static_analysis', ['❌']))[:50]
            
            report.append(
                f"| {req['id']} | {req['priority']} | {impl} | {tests} | {verify} | {static} |"
            )
        
        if self.issues:
            report.append("\n## ⚠️ Problemas de Trazabilidad\n")
            for issue in self.issues:
                report.append(f"- ❌ {issue}")
        
        return "\n".join(report)
    
    def check_coverage(self) -> float:
        """Calcula porcentaje de cobertura de trazabilidad."""
        total_checks = len(self.requirements) * 4  # 4 niveles de trazabilidad
        covered = 0
        
        for req in self.requirements:
            if req.get('implemented_by'):
                covered += 1
            if req.get('tested_by'):
                covered += 1
            if req.get('verified_by'):
                covered += 1
            if req.get('static_analysis'):
                covered += 1
        
        return (covered / total_checks) * 100

if __name__ == "__main__":
    matrix = TraceabilityMatrix("traceability/requirements.json")
    
    if matrix.verify_traceability():
        print("✅ TRAZABILIDAD COMPLETA - Todos los requisitos cubiertos")
    else:
        print("❌ TRAZABILIDAD INCOMPLETA - Ver issues abajo")
    
    print(matrix.generate_report())
    print(f"\n📊 Cobertura trazabilidad: {matrix.check_coverage():.1f}%")
    
    sys.exit(0 if matrix.verify_traceability() else 1)
