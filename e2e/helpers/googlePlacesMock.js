export async function installGooglePlacesMock(page, { withSuggestion = false } = {}) {
  await page.addInitScript(
    ({ showSuggestion }) => {
      const selectedAddress = {
        formattedAddress: "10 Rue du Test, 1000 Bruxelles, Belgium",
        addressComponents: [
          { longText: "Bruxelles", shortText: "Bruxelles", types: ["locality"] },
          { longText: "1000", shortText: "1000", types: ["postal_code"] },
          { longText: "Belgium", shortText: "BE", types: ["country"] },
        ],
        location: { lat: () => 50.851, lng: () => 4.353 },
        async fetchFields() {},
      };

      class MockPlaceAutocompleteElement extends HTMLElement {
        constructor() {
          super();
          this._value = "";
          this._disabled = false;
          this._required = false;
          this._placeholder = "";
          const shadow = this.attachShadow({ mode: "open" });
          this.input = document.createElement("input");
          this.input.type = "text";
          this.input.addEventListener("input", () => {
            this._value = this.input.value;
            if (showSuggestion) this.renderSuggestion();
          });
          shadow.appendChild(this.input);
        }

        connectedCallback() {
          window.__glossedAutocomplete = this;
        }

        disconnectedCallback() {
          this.suggestion?.remove();
        }

        set value(nextValue) {
          this._value = nextValue || "";
          if (this.input) this.input.value = this._value;
        }

        get value() {
          return this._value;
        }

        set placeholder(nextValue) {
          this._placeholder = nextValue || "";
          if (this.input) this.input.placeholder = this._placeholder;
        }

        get placeholder() {
          return this._placeholder;
        }

        set disabled(nextValue) {
          this._disabled = Boolean(nextValue);
          if (this.input) this.input.disabled = this._disabled;
        }

        get disabled() {
          return this._disabled;
        }

        set required(nextValue) {
          this._required = Boolean(nextValue);
          if (this.input) this.input.required = this._required;
        }

        get required() {
          return this._required;
        }

        renderSuggestion() {
          if (this.suggestion) return;
          const container = document.createElement("div");
          container.setAttribute("data-testid", "google-places-suggestions");
          const suggestion = document.createElement("button");
          suggestion.type = "button";
          suggestion.textContent = selectedAddress.formattedAddress;
          suggestion.addEventListener("click", () => this.selectPlace(selectedAddress));
          container.appendChild(suggestion);
          this.shadowRoot.appendChild(container);
          this.suggestion = container;
        }

        selectPlace(candidate) {
          const place = {
            formattedAddress: candidate.formattedAddress || candidate.formatted_address,
            addressComponents: (
              candidate.addressComponents ||
              candidate.address_components ||
              []
            ).map((component) => ({
              longText: component.longText || component.long_name,
              shortText: component.shortText || component.short_name,
              types: component.types,
            })),
            location: candidate.location || candidate.geometry?.location,
            async fetchFields() {},
          };
          const event = new Event("gmp-select", { bubbles: true });
          Object.defineProperty(event, "placePrediction", {
            value: { toPlace: () => place },
          });
          this.dispatchEvent(event);
        }
      }

      if (!customElements.get("glossed-place-autocomplete-mock")) {
        customElements.define("glossed-place-autocomplete-mock", MockPlaceAutocompleteElement);
      }

      window.google = {
        maps: {
          places: { PlaceAutocompleteElement: MockPlaceAutocompleteElement },
        },
      };
      window.__selectGlossedPlace = (place) => window.__glossedAutocomplete.selectPlace(place);
    },
    { showSuggestion: withSuggestion }
  );
}
