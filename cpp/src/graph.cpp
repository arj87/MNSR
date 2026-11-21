#include "../include/graph.h"
#include <algorithm>
#include <queue>
#include <cstdlib>
#include <ctime>
#include <cmath>
#include <random>

static const std::vector<std::string> INDIAN_BANKS = {
    "SBI","HDFC","ICICI","Axis","Kotak","PNB","Yes_Bank","Canara","BOB","Union"
};

std::string Graph::bankName(int i) {
    if (i < (int)INDIAN_BANKS.size()) return INDIAN_BANKS[i];
    return "Bank_" + std::to_string(i + 1);
}

void Graph::clear() {
    adjList.clear();
    nodes.clear();
}

void Graph::addNode(const Node& n) {
    nodes[n.id] = n;
    if (adjList.find(n.id) == adjList.end())
        adjList[n.id] = {};
}

void Graph::addEdge(const std::string& from, const std::string& to, double weight) {
    adjList[from][to] = weight;
    if (nodes.find(from) == nodes.end()) { Node n; n.id = from; nodes[from] = n; }
    if (nodes.find(to) == nodes.end()) { Node n; n.id = to; nodes[to] = n; }
    if (adjList.find(to) == adjList.end()) adjList[to] = {};
}

void Graph::removeEdge(const std::string& from, const std::string& to) {
    if (adjList.count(from)) adjList[from].erase(to);
}

bool Graph::hasEdge(const std::string& from, const std::string& to) const {
    auto it = adjList.find(from);
    if (it == adjList.end()) return false;
    return it->second.count(to) > 0;
}

double Graph::edgeWeight(const std::string& from, const std::string& to) const {
    auto it = adjList.find(from);
    if (it == adjList.end()) return 0.0;
    auto jt = it->second.find(to);
    if (jt == it->second.end()) return 0.0;
    return jt->second;
}

std::vector<std::string> Graph::getNodeIds() const {
    std::vector<std::string> ids;
    for (const auto& [id, _] : nodes) ids.push_back(id);
    return ids;
}

std::vector<Edge> Graph::getEdges() const {
    std::vector<Edge> edges;
    for (const auto& [from, nbrs] : adjList)
        for (const auto& [to, w] : nbrs)
            edges.push_back({from, to, w});
    return edges;
}

const std::map<std::string, double>& Graph::getNeighbors(const std::string& node) const {
    static std::map<std::string, double> empty;
    auto it = adjList.find(node);
    if (it == adjList.end()) return empty;
    return it->second;
}

double Graph::totalEdgeWeight() const {
    double total = 0;
    for (const auto& [from, nbrs] : adjList)
        for (const auto& [to, w] : nbrs)
            total += w;
    return total;
}

Graph::BFSResult Graph::bfs(const std::string& source) const {
    BFSResult result;
    std::set<std::string> visited;
    std::queue<std::string> q;
    q.push(source);
    visited.insert(source);
    result.visited.push_back(source);
    while (!q.empty()) {
        auto u = q.front(); q.pop();
        for (const auto& [v, w] : getNeighbors(u)) {
            if (!visited.count(v)) {
                visited.insert(v);
                result.treeEdges.push_back({u, v, w});
                result.visited.push_back(v);
                q.push(v);
            }
        }
    }
    return result;
}

void Graph::dfsHelper(const std::string& node, std::set<std::string>& visited,
                      std::vector<std::string>& order, std::vector<Edge>& treeEdges,
                      std::vector<Edge>& backEdges, std::map<std::string, std::string>& parent) const {
    visited.insert(node);
    order.push_back(node);
    for (const auto& [v, w] : getNeighbors(node)) {
        if (!visited.count(v)) {
            parent[v] = node;
            treeEdges.push_back({node, v, w});
            dfsHelper(v, visited, order, treeEdges, backEdges, parent);
        } else if (parent.count(node) == 0 || parent[node] != v) {
            backEdges.push_back({node, v, w});
        }
    }
}

Graph::DFSResult Graph::dfs(const std::string& source) const {
    DFSResult result;
    std::set<std::string> visited;
    std::map<std::string, std::string> parent;
    dfsHelper(source, visited, result.visited, result.treeEdges, result.backEdges, parent);
    return result;
}

bool Graph::isWeaklyConnected() const {
    if (nodes.empty()) return true;
    // Build undirected adjacency
    std::map<std::string, std::set<std::string>> undirected;
    for (const auto& [from, nbrs] : adjList) {
        for (const auto& [to, w] : nbrs) {
            undirected[from].insert(to);
            undirected[to].insert(from);
        }
    }
    std::set<std::string> visited;
    std::queue<std::string> q;
    auto start = nodes.begin()->first;
    q.push(start); visited.insert(start);
    while (!q.empty()) {
        auto u = q.front(); q.pop();
        for (const auto& v : undirected[u])
            if (!visited.count(v)) { visited.insert(v); q.push(v); }
    }
    return visited.size() == nodes.size();
}

bool Graph::isStronglyConnected() const {
    if (nodes.empty()) return true;
    // Check forward reachability
    auto start = nodes.begin()->first;
    auto fwd = bfs(start);
    if (fwd.visited.size() != nodes.size()) return false;
    // Build reverse graph
    Graph rev;
    for (const auto& [id, n] : nodes) rev.addNode(n);
    for (const auto& [from, nbrs] : adjList)
        for (const auto& [to, w] : nbrs)
            rev.addEdge(to, from, w);
    auto bwd = rev.bfs(start);
    return bwd.visited.size() == nodes.size();
}

std::map<std::string, double> Graph::computeNetPositions() const {
    std::map<std::string, double> net;
    for (const auto& [id, _] : nodes) net[id] = 0.0;
    for (const auto& [from, nbrs] : adjList)
        for (const auto& [to, w] : nbrs) {
            net[to] += w;   // in-flow = creditor position
            net[from] -= w; // out-flow = debtor position
        }
    return net;
}

std::vector<std::string> Graph::matrixOrder() const {
    auto ids = getNodeIds();
    std::sort(ids.begin(), ids.end());
    return ids;
}

std::vector<std::vector<double>> Graph::adjacencyMatrix() const {
    auto order = matrixOrder();
    int n = order.size();
    std::vector<std::vector<double>> mat(n, std::vector<double>(n, 0.0));
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            mat[i][j] = edgeWeight(order[i], order[j]);
    return mat;
}

Graph Graph::generateRandom(int n, double density) {
    Graph g;
    std::mt19937 rng(42);
    std::uniform_real_distribution<double> wdist(100, 1000);
    std::uniform_real_distribution<double> pdist(0, 1);
    for (int i = 0; i < n; i++) {
        Node nd;
        nd.id = bankName(i);
        nd.capital = 1000 + (rng() % 9000);
        nd.liquidity = 500 + (rng() % 4500);
        g.addNode(nd);
    }
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            if (i != j && pdist(rng) < density)
                g.addEdge(bankName(i), bankName(j), wdist(rng));
    return g;
}

Graph Graph::generateScaleFree(int n) {
    // Barabási–Albert: each new node connects to m=2 existing nodes preferentially
    Graph g;
    std::mt19937 rng(42);
    int m = std::min(2, n - 1);
    // Start with a small seed
    for (int i = 0; i < std::min(m + 1, n); i++) {
        Node nd; nd.id = bankName(i);
        nd.capital = 2000 + (rng() % 8000);
        nd.liquidity = 1000 + (rng() % 4000);
        g.addNode(nd);
    }
    for (int i = 0; i <= m && i + 1 < n; i++)
        g.addEdge(bankName(i), bankName(i > 0 ? i - 1 : 1), 100 + (rng() % 900));

    for (int i = m + 1; i < n; i++) {
        Node nd; nd.id = bankName(i);
        nd.capital = 2000 + (rng() % 8000);
        nd.liquidity = 1000 + (rng() % 4000);
        g.addNode(nd);
        // preferential attachment: degree-weighted selection
        std::vector<std::string> pool;
        for (const auto& [id, nbrs] : g.adjList) {
            int deg = nbrs.size();
            for (int d = 0; d < std::max(1, deg); d++) pool.push_back(id);
        }
        std::set<std::string> chosen;
        int attempts = 0;
        while ((int)chosen.size() < m && attempts < 100) {
            attempts++;
            int idx = rng() % pool.size();
            if (pool[idx] != bankName(i)) chosen.insert(pool[idx]);
        }
        for (const auto& target : chosen) {
            g.addEdge(bankName(i), target, 100 + (rng() % 900));
            g.addEdge(target, bankName(i), 50 + (rng() % 500));
        }
    }
    return g;
}

Graph Graph::generateCorePeriphery(int n) {
    Graph g;
    std::mt19937 rng(42);
    int core = std::max(2, n / 3);
    for (int i = 0; i < n; i++) {
        Node nd; nd.id = bankName(i);
        nd.capital = (i < core ? 5000 : 1000) + (rng() % 2000);
        nd.liquidity = (i < core ? 2000 : 500) + (rng() % 1000);
        g.addNode(nd);
    }
    // Core fully connected
    for (int i = 0; i < core; i++)
        for (int j = 0; j < core; j++)
            if (i != j) g.addEdge(bankName(i), bankName(j), 300 + (rng() % 700));
    // Periphery connects to core
    for (int i = core; i < n; i++) {
        int coreTarget = rng() % core;
        g.addEdge(bankName(i), bankName(coreTarget), 100 + (rng() % 400));
        g.addEdge(bankName(coreTarget), bankName(i), 50 + (rng() % 200));
    }
    return g;
}
