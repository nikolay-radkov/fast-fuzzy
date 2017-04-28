"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var nonWordRegex = /[`~!@#$%^&*()\-=_+{}[\]\|\\;':",./<>?]+/g;
var whitespaceRegex = /\s+/g;
var unorm = require('unorm');

//the default options, which will be used for any unset option
var defaultOptions = {
	keySelector: function keySelector(_) {
		return _;
	},
	threshold: .6,
	ignoreCase: true,
	ignoreSymbols: true,
	normalizeWhitespace: true,
	returnScores: false,
	useDamerau: true
};

//normalize a string according to the options passed in
function normalize(string, options) {
	string = unorm.nfc(string);
	if (options.ignoreCase) {
		string = string.toLowerCase();
	}
	if (options.ignoreSymbols) {
		string = string.replace(nonWordRegex, "");
	}
	if (options.normalizeWhitespace) {
		string = string.replace(whitespaceRegex, " ").trim();
	}
	return string;
}

//the fuzzy scoring algorithm: a modification of levenshtein proposed by Peter H. Sellers
//this essentially finds the substring of "candidate" with the minimum levenshtein distance from "term"
//runtime complexity: O(mn) where m and n are the lengths of term and candidate, respectively
function levenshteinSellers(term, candidate) {
	if (term.length === 0) {
		return 1;
	}

	var rowA = new Array(candidate.length + 1).fill(0);

	for (var i = 0; i < term.length; i++) {
		var rowB = [];
		rowB[0] = i + 1;

		for (var j = 0; j < candidate.length; j++) {
			var cost = term[i] === candidate[j] ? 0 : 1;
			var m = void 0;
			var min = rowB[j] + 1; //insertion
			if ((m = rowA[j + 1] + 1) < min) min = m; //deletion
			if ((m = rowA[j] + cost) < min) min = m; //substitution
			rowB[j + 1] = min;
		}

		rowA = rowB;
	}

	return 1 - Math.min.apply(Math, _toConsumableArray(rowA)) / term.length;
}

//an implementation of the sellers algorithm using damerau-levenshtein as a base
//has all the runtime characteristics of the above, but punishes transpositions less,
//resulting in better tolerance to those types of typos
function damerauLevenshteinSellers(term, candidate) {
	if (term.length === 0) {
		return 1;
	}

	var rowA = void 0;
	var rowB = new Array(candidate.length + 1).fill(0);

	for (var i = 0; i < term.length; i++) {
		var rowC = [];
		rowC[0] = i + 1;

		for (var j = 0; j < candidate.length; j++) {
			var cost = term[i] === candidate[j] ? 0 : 1;
			var m = void 0;
			var min = rowC[j] + 1; //insertion
			if ((m = rowB[j + 1] + 1) < min) min = m; //deletion
			if ((m = rowB[j] + cost) < min) min = m; //substitution
			if (i > 0 && j > 0 && term[i] === candidate[j - 1] && term[i - 1] === candidate[j] && (m = rowA[j - 1] + cost) < min) min = m;
			rowC[j + 1] = min;
		}

		rowA = rowB;
		rowB = rowC;
	}

	return 1 - Math.min.apply(Math, _toConsumableArray(rowB)) / term.length;
}

//the core match finder: returns a sorted, filtered list of matches
//this does not normalize input, requiring users to normalize themselves
//it also expects candidates in the form {item: any, key: string}
function searchCore(term, candidates, options) {
	var scoreMethod = options.useDamerau ? damerauLevenshteinSellers : levenshteinSellers;
	var results = candidates.map(function (candidate) {
		return { item: candidate.item, key: candidate.key, score: scoreMethod(term, candidate.key) };
	}).filter(function (candidate) {
		return candidate.score >= options.threshold;
	}).sort(function (a, b) {
		if (a.score === b.score) {
			return Math.abs(a.key.length - term.length) - Math.abs(b.key.length - term.length);
		}
		return b.score - a.score;
	});

	if (!options.returnScores) {
		results = results.map(function (candidate) {
			return candidate.item;
		});
	}

	return results;
}

//transforms a list of candidates into objects with normalized search keys
//the keySelector is used to pick a string from an object to search by
function createSearchItems(items, options) {
	return items.map(function (item) {
		return { item: item, key: normalize(options.keySelector(item), options) };
	});
}

//wrapper for exporting sellers while allowing options to be passed in
function fuzzy(term, candidate, options) {
	options = Object.assign({}, defaultOptions, options);
	var scoreMethod = options.useDamerau ? damerauLevenshteinSellers : levenshteinSellers;
	term = normalize(term, options);
	candidate = normalize(candidate, options);
	return scoreMethod(term, candidate);
}

//simple one-off search. Useful if you don't expect to use the same candidate list again
function search(term, candidates, options) {
	options = Object.assign({}, defaultOptions, options);
	return searchCore(normalize(term, options), createSearchItems(candidates, options), options);
}

//class that improves performance of searching the same set multiple times
//normalizes the strings and caches the result for future calls

var Searcher = function () {
	function Searcher(candidates, options) {
		_classCallCheck(this, Searcher);

		this.options = Object.assign({}, defaultOptions, options);
		this.candidates = [];
		this.add.apply(this, _toConsumableArray(candidates));
	}

	_createClass(Searcher, [{
		key: "add",
		value: function add() {
			var _candidates;

			for (var _len = arguments.length, candidates = Array(_len), _key = 0; _key < _len; _key++) {
				candidates[_key] = arguments[_key];
			}

			(_candidates = this.candidates).push.apply(_candidates, _toConsumableArray(createSearchItems(candidates, this.options)));
		}
	}, {
		key: "search",
		value: function search(term, options) {
			options = Object.assign({}, this.options, options);
			return searchCore(normalize(term, this.options), this.candidates, options);
		}
	}]);

	return Searcher;
}();

module.exports = {
	fuzzy: fuzzy,
	search: search,
	Searcher: Searcher
};