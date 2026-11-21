#include "../include/netting.h"
#include <algorithm>
#include <cmath>

std::map<std::string, double> Netting::computeNetPositions(const Graph& g) {
    return g.computeNetPositions();
}

// DFS-based cycle finding: find one simple cycle starting and ending at 'start'
// Returns true and fills 'cycle' if found
bool Netting::findCycleDFS(const std::string& node, const std::string& start,
                            std::set<std::string>& visited,
                            std::vector<std::string>& path,
                            std::vector<std::string>& cycle,
                            int depth) {
    if (depth > 0 && node == start) {
        cycle = path;
        cycle.push_back(start);
        return true;
    }
    if (depth > 0 && visited.count(node)) return false;

    visited.insert(node);
    path.push_back(node);

    for (const auto& [nbr, w] : graph.getNeighbors(node)) {
        if (nbr == start && depth > 0) {
            cycle = path;
            cycle.push_back(start);
            path.pop_back();
            visited.erase(node);
            return true;
        }
        if (!visited.count(nbr)) {
            if (findCycleDFS(nbr, start, visited, path, cycle, depth + 1)) {
                path.pop_back();
                visited.erase(node);
                return true;
            }
        }
    }

    path.pop_back();
    visited.erase(node);
    return false;
}

std::vector<std::vector<std::string>> Netting::findAllCyclesHelper() {
    std::vector<std::vector<std::string>> cycles;
    std::set<std::string> alreadyFoundStarts;

    auto nodeIds = graph.getNodeIds();
    for (const auto& startNode : nodeIds) {
        // Check if this node has at least one outgoing edge
        if (graph.getNeighbors(startNode).empty()) continue;
        // Look for a cycle starting at this node
        std::set<std::string> visited;
        std::vector<std::string> path;
        std::vector<std::string> cycle;
        if (findCycleDFS(startNode, startNode, visited, path, cycle, 0)) {
            // Normalize cycle to avoid duplicates (start from lexicographically smallest)
            // Remove last element (it repeats start)
            std::vector<std::string> cyc(cycle.begin(), cycle.end() - 1);
            if (!cyc.empty()) {
                cycles.push_back(cycle); // keep with repeated start for clarity
            }
        }
    }
    return cycles;
}

std::vector<std::vector<std::string>> Netting::findAllCycles() {
    return findAllCyclesHelper();
}

void Netting::cancelCycle(const std::vector<std::string>& cycle, std::vector<NettingStep>& steps) {
    if (cycle.size() < 2) return;

    // Find minimum weight along cycle edges
    double minW = std::numeric_limits<double>::max();
    for (size_t i = 0; i + 1 < cycle.size(); i++) {
        double w = graph.edgeWeight(cycle[i], cycle[i+1]);
        if (w > 0) minW = std::min(minW, w);
    }
    if (minW == std::numeric_limits<double>::max() || minW <= 0) return;

    // Emit cycle_found step
    {
        SimpleJSON stepData = makeObject();
        std::vector<SimpleJSON> cyc_arr;
        for (const auto& n : cycle) cyc_arr.push_back(SimpleJSON(n));
        stepData["cycle"] = SimpleJSON(cyc_arr);
        stepData["min_weight"] = SimpleJSON(minW);
        steps.push_back({"cycle_found", stepData});
    }

    // Reduce each edge by minW
    for (size_t i = 0; i + 1 < cycle.size(); i++) {
        const std::string& from = cycle[i];
        const std::string& to   = cycle[i+1];
        double oldW = graph.edgeWeight(from, to);
        double newW = oldW - minW;

        SimpleJSON stepData = makeObject();
        stepData["from"] = SimpleJSON(from);
        stepData["to"]   = SimpleJSON(to);
        stepData["old_weight"] = SimpleJSON(oldW);
        stepData["new_weight"] = SimpleJSON(newW);
        stepData["reduced_by"] = SimpleJSON(minW);

        if (newW <= 1e-9) {
            graph.removeEdge(from, to);
            steps.push_back({"edge_removed", stepData});
        } else {
            graph.adjList[from][to] = newW;
            steps.push_back({"edge_reduced", stepData});
        }
    }
}

NettingResult Netting::runMultilateralNetting() {
    NettingResult result;
    result.originalTotal = graph.totalEdgeWeight();
    result.netPositionsBefore = computeNetPositions(graph);

    int maxIter = 1000;
    int iter = 0;
    while (iter++ < maxIter) {
        auto cycles = findAllCyclesHelper();
        if (cycles.empty()) break;
        // Cancel first found cycle
        cancelCycle(cycles[0], result.steps);
        result.cancelledCycles.push_back(cycles[0]);
    }

    result.newTotal = graph.totalEdgeWeight();
    result.netPositionsAfter = computeNetPositions(graph);
    if (result.originalTotal > 1e-9)
        result.savingsPct = (result.originalTotal - result.newTotal) / result.originalTotal * 100.0;
    else
        result.savingsPct = 0.0;
    return result;
}

NettingResult Netting::runBilateralNetting() {
    NettingResult result;
    result.originalTotal = graph.totalEdgeWeight();
    result.netPositionsBefore = computeNetPositions(graph);

    auto nodeIds = graph.getNodeIds();
    for (size_t i = 0; i < nodeIds.size(); i++) {
        for (size_t j = i + 1; j < nodeIds.size(); j++) {
            const std::string& A = nodeIds[i];
            const std::string& B = nodeIds[j];
            if (graph.hasEdge(A, B) && graph.hasEdge(B, A)) {
                double wAB = graph.edgeWeight(A, B);
                double wBA = graph.edgeWeight(B, A);
                double minW = std::min(wAB, wBA);

                SimpleJSON stepData = makeObject();
                stepData["nodeA"] = SimpleJSON(A);
                stepData["nodeB"] = SimpleJSON(B);
                stepData["wAB"] = SimpleJSON(wAB);
                stepData["wBA"] = SimpleJSON(wBA);
                stepData["netted"] = SimpleJSON(minW);

                double newAB = wAB - minW;
                double newBA = wBA - minW;

                if (newAB <= 1e-9) graph.removeEdge(A, B);
                else graph.adjList[A][B] = newAB;

                if (newBA <= 1e-9) graph.removeEdge(B, A);
                else graph.adjList[B][A] = newBA;

                result.steps.push_back({"bilateral_net", stepData});
            }
        }
    }

    result.newTotal = graph.totalEdgeWeight();
    result.netPositionsAfter = computeNetPositions(graph);
    if (result.originalTotal > 1e-9)
        result.savingsPct = (result.originalTotal - result.newTotal) / result.originalTotal * 100.0;
    else
        result.savingsPct = 0.0;
    return result;
}
